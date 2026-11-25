// V2-only adaptation of youngbinkim0/opencode-fallback 0.3.1 (MIT; see LICENSE).
const originKey = (model) => model && `${model.providerID}/${model.id}`
const modelKey = (model) => model && `${originKey(model)}#${model.variant ?? "default"}`
const cooling = new Map()
// Config edits reactivate this module's hooks. Carry only live session bookkeeping across activations.
const locations = new Map()
const now = () => Date.now()

// Adapted from upstream parseModelRef and fallback-state cooldown logic.
function parseModelRef(value) {
  const parts = typeof value === "string" && /^([^/#\s]+)\/([^#\s]+)(?:#([^#\s]+))?$/.exec(value)
  if (!parts) throw new Error("Invalid fallback model reference")
  const [, providerID, id, variant] = parts
  return { providerID, id, ...(variant ? { variant } : {}) }
}

function retryAfterMs(value, time) {
  if (value === null) return 0
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000
  const until = Date.parse(value)
  return Number.isFinite(until) ? Math.max(0, until - time) : 0
}

export async function installFallback(ctx) {
    const options = ctx.options ?? {}
    // Each chain is an ordered array of provider/model#variant refs. Variants
    // select request settings, but do not create a separate quota scope.
    const chains = new Map(Object.entries(options.chains ?? {}).map(([id, refs]) => {
      const chain = refs.map(parseModelRef)
      if (chain.length < 2 || new Set(chain.map(originKey)).size !== chain.length) {
        throw new Error(`Invalid fallback chain for ${id}: expected distinct models`)
      }
      return [id, chain]
    }))
    const key = JSON.stringify([ctx.location.directory,ctx.location.workspaceID])
    const previous = locations.get(key)
    // A fresh location without chains has nothing to do. On reload, keep cleanup
    // active even if the last configured chain was removed mid-execution.
    if (!chains.size && !previous) return () => {}
    const accounts = new Map(Object.entries(options.accounts ?? {}))
    const cooldownMs = options.cooldown_ms ?? 60_000
    const maxRetryAfterMs = options.max_retry_after_ms ?? 900_000
    const state = previous ?? {selected:new Map(),rateLimited:new Map(),running:new Set(),switching:new Set()}
    const {selected,rateLimited,running,switching}=state
    locations.set(key,state)
    const controller = new AbortController()
    const location = { directory: ctx.location.directory, ...(ctx.location.workspaceID ? { workspaceID: ctx.location.workspaceID } : {}) }

    const candidates = (id, model) => {
      const chain = chains.get(id)
      if (!chain) return
      const index = chain.findIndex((entry) => originKey(entry) === originKey(model))
      if (index !== -1) return chain.slice(index + 1)
    }
    const scope = async (model) => {
      const { data: provider } = await ctx.provider.get({ providerID: model.providerID, location })
      // Connection metadata only. Never resolve the credential or inspect request authentication.
      const connection = await ctx.integration.connection.active(provider.integrationID ?? model.providerID)
      const configured = accounts.get(model.providerID)
      const account = connection?.type === "credential" ? `connection:${connection.id}`
        : connection?.type === "env" ? `env-slot:${connection.name}`
        : configured && `configured:${configured}`
      return account && JSON.stringify([model.providerID, model.id, account])
    }
    const isCooling = async (model) => {
      const time = now()
      for (const [key, until] of cooling) if (until <= time) cooling.delete(key)
      return (cooling.get(await scope(model)) ?? 0) > now()
    }
    const select = async (sessionID, id, original, next, admission = false) => {
      if (switching.has(sessionID)) return
      switching.add(sessionID)
      try {
        const data = next.length ? (await ctx.model.list({ location })).data : []
        let target
        for (const candidate of next) {
          if (!data.some((model) => model.enabled && originKey(model) === originKey(candidate)
            && (!candidate.variant || model.variants.some((variant) => variant.id === candidate.variant)))) continue
          if (await isCooling(candidate).catch(() => false)) continue
          target = candidate
          break
        }
        const current = await ctx.session.get({ sessionID })
        if (current.agent !== id || modelKey(current.model) !== modelKey(original)) return
        if (admission && (running.has(sessionID) || selected.has(sessionID))) return
        const selection = selected.get(sessionID)
        if (selection && (selection.agent !== id || modelKey(selection.current) !== modelKey(original))) return
        if (!target) return "exhausted"
        await ctx.session.switchModel({ sessionID, model: target })
        selected.set(sessionID, { agent: id, original: selection?.original ?? original, current: target })
        return "switched"
      } finally {
        switching.delete(sessionID)
      }
    }
    const restore = async (sessionID) => {
      rateLimited.delete(sessionID)
      running.delete(sessionID)
      const selection = selected.get(sessionID)
      if (!selection) return
      const current = await ctx.session.get({ sessionID })
      if (selected.get(sessionID) !== selection || running.has(sessionID)) return
      if (current.agent === selection.agent && modelKey(current.model) === modelKey(selection.current)) {
        await ctx.session.switchModel({ sessionID, model: selection.original })
      }
      selected.delete(sessionID)
    }

    await ctx.session.hook("prompt", async ({ sessionID }) => {
      if (!chains.size || running.has(sessionID) || selected.has(sessionID)) return
      try {
        const session = await ctx.session.get({ sessionID })
        const next = candidates(session.agent, session.model)
        if (next?.length && await isCooling(session.model)) {
          await select(sessionID, session.agent, session.model, next, true)
        }
      } catch {
        // Optional routing never prevents the host from admitting the prompt.
      }
    })
    await ctx.session.hook("context", ({ sessionID, agent: id }) => {
      if (chains.has(id)) running.add(sessionID)
    })
    await ctx.session.hook("model.request", ({ kind, sessionID }) => {
      if (kind === "primary") rateLimited.delete(sessionID)
    })
    await ctx.session.hook("http.response", ({ kind, agent: id, sessionID, model, response }) => {
      if (kind !== "primary" || !candidates(id, model)) return
      if (response.status === 429) rateLimited.set(sessionID, { agent: id, model, retryAfter: response.headers.get("retry-after") })
      else rateLimited.delete(sessionID)
    })
    await ctx.session.hook("retry", async (event) => {
      const next = candidates(event.agent, event.model)
      if (!next) return
      const failed = rateLimited.get(event.sessionID)
      rateLimited.delete(event.sessionID)
      // Only a non-success primary HTTP response, before model output or tool
      // calls. Never opt partial streams, transport errors, or other flows in.
      if (!failed || failed.agent !== event.agent || event.error.status !== 429 || modelKey(failed.model) !== modelKey(event.model)) return
      try {
        const key = await scope(failed.model)
        const time = now()
        const delay = Math.max(cooldownMs, Math.min(maxRetryAfterMs, retryAfterMs(failed.retryAfter, time)))
        if (key) cooling.set(key, Math.max(cooling.get(key) ?? 0, time + delay))
      } catch {
        // The same child can still safely use native retry without shared cooldown.
      }
      try {
        const outcome = await select(event.sessionID, event.agent, failed.model, next)
        if (outcome === "switched") event.decision = { retry: true, delay: 0 }
        // Chains do not go backwards or repeat a known-limited rung.
        else if (outcome === "exhausted") event.decision = { retry: false }
      } catch {
        // Preserve the native retry decision if the model change is unavailable.
      }
    })
    await ctx.session.hook("experimental.idle", async ({ sessionID }) => {
      await restore(sessionID).catch(() => {})
    })
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({
          types: ["session.deleted", "session.execution.failed", "session.execution.interrupted"],
          signal: controller.signal,
        })) {
          const { sessionID } = event.data
          if (!running.has(sessionID) && !selected.has(sessionID)) continue
          if (event.type === "session.deleted") {
            running.delete(sessionID)
            rateLimited.delete(sessionID)
            selected.delete(sessionID)
          } else await restore(sessionID).catch(() => {})
        }
      } catch {
        // Cleanup can still happen in the idle hook if this stream closes.
      }
    })()
    return () => {
      controller.abort()
      if(!selected.size && !rateLimited.size && !running.size && !switching.size) locations.delete(key)
    }
}
