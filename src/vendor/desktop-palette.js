/*! See LICENSE and THIRD_PARTY_NOTICES.md at the package root. */
import { Portal, addEventListener, classList, className, createComponent, delegateEvents, effect, insert, isServer, memo, mergeProps, setAttribute, setStyleProperty, spread, template, use } from "solid-js/web";
import { For, Show, batch, createContext, createEffect, createMemo, createSelector, createSignal, createUniqueId, on, onCleanup, onMount, splitProps, untrack, useContext } from "solid-js";
import { createStore } from "solid-js/store";
/** no operation */
var noop = (() => void 0);
var isNonNullable = (i) => i != null;
var filterNonNullable = (arr) => arr.filter(isNonNullable);
/**
* Accesses the value of a MaybeAccessor
* @example
* ```ts
* access("foo") // => "foo"
* access(() => "foo") // => "foo"
* ```
*/
var access = (v) => typeof v === "function" && !v.length ? v() : v;
var asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
/**
* Handle items removed and added to the array by diffing it by refference.
*
* @param current new array instance
* @param prev previous array copy
* @param handleAdded called once for every added item to array
* @param handleRemoved called once for every removed from array
*/
function handleDiffArray(current, prev, handleAdded, handleRemoved) {
	const currLength = current.length;
	const prevLength = prev.length;
	let i = 0;
	if (!prevLength) {
		for (; i < currLength; i++) handleAdded(current[i]);
		return;
	}
	if (!currLength) {
		for (; i < prevLength; i++) handleRemoved(prev[i]);
		return;
	}
	for (; i < prevLength; i++) if (prev[i] !== current[i]) break;
	let prevEl;
	let currEl;
	prev = prev.slice(i);
	current = current.slice(i);
	for (prevEl of prev) if (!current.includes(prevEl)) handleRemoved(prevEl);
	for (currEl of current) if (!prev.includes(currEl)) handleAdded(currEl);
}
/**
* Instantiate a new ResizeObserver that automatically get's disposed on cleanup.
*
* @param callback handler called once element size changes
* @param options ResizeObserver options
* @returns `observe` and `unobserve` functions
*/
function makeResizeObserver(callback, options) {
	if (isServer) return {
		observe: noop,
		unobserve: noop
	};
	const observer = new ResizeObserver(callback);
	onCleanup(observer.disconnect.bind(observer));
	return {
		observe: (ref) => observer.observe(ref, options),
		unobserve: observer.unobserve.bind(observer)
	};
}
/**
* Create resize observer instance, listening for changes to size of the reactive {@link targets} array.
*
* @param targets Elements to be observed. Can be a reactive signal or store top-level array.
* @param onResize - Function handler to trigger on element resize
*
* @example
* ```tsx
* let ref
* createResizeObserver(() => ref, ({ width, height }, el) => {
*   if (el === ref) console.log(width, height)
* });
* <div ref={ref}/>
* ```
*/
function createResizeObserver(targets, onResize, options) {
	if (isServer) return;
	const previousMap = /* @__PURE__ */ new WeakMap(), { observe, unobserve } = makeResizeObserver((entries) => {
		for (const entry of entries) {
			const { contentRect, target } = entry, width = Math.round(contentRect.width), height = Math.round(contentRect.height), previous = previousMap.get(target);
			if (!previous || previous.width !== width || previous.height !== height) {
				onResize(contentRect, target, entry);
				previousMap.set(target, {
					width,
					height
				});
			}
		}
	}, options);
	createEffect((prev) => {
		const refs = filterNonNullable(asArray(access(targets)));
		handleDiffArray(refs, prev, observe, unobserve);
		return refs;
	}, []);
}
var _tmpl$$4 = /*#__PURE__*/ template(`<svg aria-hidden=true data-slot=icon-svg width=16 height=16 viewBox="0 0 16 16"fill=none><use>`);
function Icon(props) {
	return (() => {
		var _el$ = _tmpl$$4(), _el$2 = _el$.firstChild;
		effect(() => setAttribute(_el$2, "href", `#opencode-v2-icon-${props.name}`));
		return _el$;
	})();
}
var RESTING = ["idle", "scrolling"].flatMap((status) => [false, true].flatMap((hovered) => [false, true].flatMap((verticalOverflow) => [false, true].map((horizontalOverflow) => Object.freeze({
	status,
	hovered,
	verticalOverflow,
	horizontalOverflow
})))));
var DISPOSED = Object.freeze({ status: "disposed" });
var INITIAL_SCROLL_THUMB_STATE = resting("idle", false, false, false);
var SCROLLED = Object.freeze({ type: "scrolled" });
var SCROLL_IDLE_ELAPSED = Object.freeze({ type: "idle.elapsed" });
Object.freeze({
	type: "hover.changed",
	hovered: true
});
Object.freeze({
	type: "hover.changed",
	hovered: false
});
var SCROLL_THUMB_DISPOSED = Object.freeze({ type: "disposed" });
var OVERFLOW = [false, true].flatMap((vertical) => [false, true].map((horizontal) => Object.freeze({
	type: "overflow.changed",
	vertical,
	horizontal
})));
var NONE = Object.freeze([]);
var RESET = Object.freeze(["reset-idle-timer"]);
var CLEAR = Object.freeze(["clear-idle-timer"]);
var RELEASE = Object.freeze(["release-capture"]);
var RELEASE_AND_RESET = Object.freeze(["release-capture", "reset-idle-timer"]);
var RELEASE_AND_CLEAR = Object.freeze(["release-capture", "clear-idle-timer"]);
var KEEP = new WeakMap([...RESTING, DISPOSED].map((state) => [state, Object.freeze({
	state,
	effects: NONE
})]));
var RESTART = new Map(RESTING.map((state) => [state, Object.freeze({
	state,
	effects: RESET
})]));
function overflowChanged(vertical, horizontal) {
	return OVERFLOW[(vertical ? 2 : 0) + (horizontal ? 1 : 0)];
}
function transitionScrollThumb(state, event) {
	if (state.status === "disposed") return to(state, NONE);
	if (event.type === "disposed") return to(DISPOSED, state.status === "dragging" ? RELEASE_AND_CLEAR : state.status === "scrolling" ? CLEAR : NONE);
	if (state.status === "dragging") return transitionDragging(state, event);
	return transitionResting(state, event);
}
function selectShowVerticalThumb(state) {
	return state.status !== "disposed" && state.verticalOverflow;
}
/** Scroll-only reveal: a drag shows the thumb through `selectDraggingAxis` instead. */
function selectThumbScrolling(state) {
	return state.status === "scrolling";
}
function selectDraggingAxis(state) {
	return state.status === "dragging" ? state.axis : void 0;
}
function transitionResting(state, event) {
	switch (event.type) {
		case "hover.changed": return to(resting(state.status, event.hovered, state.verticalOverflow, state.horizontalOverflow), NONE);
		case "scrolled":
			if (!state.verticalOverflow && !state.horizontalOverflow) return to(state, NONE);
			return to(resting("scrolling", state.hovered, state.verticalOverflow, state.horizontalOverflow), RESET);
		case "idle.elapsed":
			if (state.status !== "scrolling") return to(state, NONE);
			return to(resting("idle", state.hovered, state.verticalOverflow, state.horizontalOverflow), NONE);
		case "overflow.changed":
			if (state.status === "scrolling" && !event.vertical && !event.horizontal) return to(resting("idle", state.hovered, false, false), CLEAR);
			return to(resting(state.status, state.hovered, event.vertical, event.horizontal), NONE);
		case "drag.started":
			if (!(event.axis === "vertical" ? state.verticalOverflow : state.horizontalOverflow)) return to(state, NONE);
			return {
				state: {
					status: "dragging",
					axis: event.axis,
					pointerId: event.pointerId,
					grabOffset: event.grabOffset,
					rtl: event.rtl,
					hovered: state.hovered,
					scrolled: state.status === "scrolling",
					verticalOverflow: state.verticalOverflow,
					horizontalOverflow: state.horizontalOverflow
				},
				effects: state.status === "scrolling" ? CLEAR : NONE
			};
		case "drag.ended": return to(state, NONE);
	}
}
function transitionDragging(state, event) {
	switch (event.type) {
		case "hover.changed":
			if (event.hovered === state.hovered) return to(state, NONE);
			return to({
				...state,
				hovered: event.hovered
			}, NONE);
		case "scrolled":
			if (state.scrolled) return to(state, NONE);
			return to({
				...state,
				scrolled: true
			}, NONE);
		case "overflow.changed":
			if (!(state.axis === "vertical" ? event.vertical : event.horizontal)) return release(state, event.vertical, event.horizontal);
			if (event.vertical === state.verticalOverflow && event.horizontal === state.horizontalOverflow) return to(state, NONE);
			return to({
				...state,
				verticalOverflow: event.vertical,
				horizontalOverflow: event.horizontal
			}, NONE);
		case "drag.ended":
			if (event.pointerId !== state.pointerId) return to(state, NONE);
			return release(state, state.verticalOverflow, state.horizontalOverflow);
		case "idle.elapsed":
		case "drag.started": return to(state, NONE);
	}
}
function release(state, vertical, horizontal) {
	if (state.scrolled && (vertical || horizontal)) return to(resting("scrolling", state.hovered, vertical, horizontal), RELEASE_AND_RESET);
	return to(resting("idle", state.hovered, vertical, horizontal), RELEASE);
}
function to(state, effects) {
	if (effects === NONE) return KEEP.get(state) ?? keep(state);
	return (effects === RESET ? RESTART.get(state) : void 0) ?? {
		state,
		effects
	};
}
function keep(state) {
	const transition = Object.freeze({
		state,
		effects: NONE
	});
	KEEP.set(state, transition);
	return transition;
}
function resting(status, hovered, vertical, horizontal) {
	return RESTING[(status === "scrolling" ? 8 : 0) + (hovered ? 4 : 0) + (vertical ? 2 : 0) + (horizontal ? 1 : 0)];
}
var _tmpl$$3 = /*#__PURE__*/ template(`<div data-slot=menu-scroll-thumb aria-hidden=true>`);
var _tmpl$2$3 = /*#__PURE__*/ template(`<div data-component=menu-scroll><div data-slot=menu-scroll-viewport><div data-slot=menu-scroll-content>`);
/**
* A scroll container for menus, popovers and dialog lists. It hides the native scrollbar and draws the shared thumb
* over the content, so rows keep equal start and end padding whether or not the list overflows. Touch devices and
* high-contrast modes keep the native scrollbar.
*/
function MenuScroll(props) {
	const [local, rest] = splitProps(props, [
		"class",
		"children",
		"viewportClass",
		"viewportRef",
		"onScroll"
	]);
	const [geometry, setGeometry] = createStore({
		size: 0,
		start: 4
	});
	const [thumbState, setThumbState] = createSignal(INITIAL_SCROLL_THUMB_STATE);
	let viewport;
	let content;
	let thumb;
	let idleTimer;
	const onIdleElapsed = () => {
		idleTimer = void 0;
		dispatch(SCROLL_IDLE_ELAPSED);
	};
	const dispatch = (event) => {
		const prev = untrack(thumbState);
		const next = transitionScrollThumb(prev, event);
		if (next.state !== prev) setThumbState(next.state);
		for (const effect of next.effects) {
			if (effect === "release-capture") {
				if (prev.status === "dragging" && thumb?.hasPointerCapture(prev.pointerId)) thumb.releasePointerCapture(prev.pointerId);
				continue;
			}
			clearTimeout(idleTimer);
			idleTimer = effect === "reset-idle-timer" ? setTimeout(onIdleElapsed, 800) : void 0;
		}
	};
	const measure = () => {
		const track = Math.max(0, viewport.clientHeight - 8);
		const size = Math.min(track, Math.max(24, viewport.clientHeight / Math.max(1, viewport.scrollHeight) * track));
		const max = viewport.scrollHeight - viewport.clientHeight;
		setGeometry("size", size);
		setGeometry("start", 4 + (max > 0 ? viewport.scrollTop / max * (track - size) : 0));
		dispatch(overflowChanged(max > 0, false));
	};
	const onPointerEnd = (event) => dispatch({
		type: "drag.ended",
		pointerId: event.pointerId
	});
	onMount(() => createResizeObserver([viewport, content], measure));
	onCleanup(() => dispatch(SCROLL_THUMB_DISPOSED));
	return (() => {
		var _el$ = _tmpl$2$3(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild;
		use((element) => {
			viewport = element;
			local.viewportRef?.(element);
		}, _el$2);
		spread(_el$2, mergeProps(rest, {
			"data-scrollable": "",
			get ["class"]() {
				return local.viewportClass;
			},
			"onScroll": (event) => {
				measure();
				dispatch(SCROLLED);
				local.onScroll?.(event);
			},
			"onFocusIn": (event) => {
				if (event.target !== viewport) event.target.scrollIntoView({
					block: "nearest",
					inline: "nearest"
				});
			}
		}), false, true);
		var _ref$ = content;
		typeof _ref$ === "function" ? use(_ref$, _el$3) : content = _el$3;
		insert(_el$3, () => local.children);
		insert(_el$, createComponent(Show, {
			get when() {
				return selectShowVerticalThumb(thumbState());
			},
			get children() {
				var _el$4 = _tmpl$$3();
				_el$4.addEventListener("lostpointercapture", onPointerEnd);
				_el$4.addEventListener("pointercancel", onPointerEnd);
				_el$4.$$pointerup = onPointerEnd;
				_el$4.$$pointermove = (event) => {
					const drag = untrack(thumbState);
					if (drag.status !== "dragging" || drag.pointerId !== event.pointerId) return;
					if (event.isTrusted && (event.buttons & 1) === 0) return onPointerEnd(event);
					const travel = viewport.clientHeight - 8 - geometry.size;
					if (travel <= 0) return;
					viewport.scrollTop = (event.clientY - viewport.getBoundingClientRect().top - 4 - drag.grabOffset) / travel * (viewport.scrollHeight - viewport.clientHeight);
				};
				_el$4.$$pointerdown = (event) => {
					if (event.button !== 0) return;
					event.preventDefault();
					event.stopPropagation();
					dispatch({
						type: "drag.started",
						axis: "vertical",
						pointerId: event.pointerId,
						grabOffset: event.clientY - event.currentTarget.getBoundingClientRect().top,
						rtl: false
					});
					if (event.isTrusted && selectDraggingAxis(untrack(thumbState)) === "vertical") event.currentTarget.setPointerCapture(event.pointerId);
				};
				var _ref$2 = thumb;
				typeof _ref$2 === "function" ? use(_ref$2, _el$4) : thumb = _el$4;
				effect((_p$) => {
					var _v$ = `${geometry.size}px`, _v$2 = `translateY(${geometry.start}px)`;
					_v$ !== _p$.e && setStyleProperty(_el$4, "height", _p$.e = _v$);
					_v$2 !== _p$.t && setStyleProperty(_el$4, "transform", _p$.t = _v$2);
					return _p$;
				}, {
					e: void 0,
					t: void 0
				});
				return _el$4;
			}
		}), null);
		effect((_p$) => {
			var _v$3 = selectThumbScrolling(thumbState()) ? "" : void 0, _v$4 = selectDraggingAxis(thumbState()) === "vertical" ? "" : void 0, _v$5 = local.class;
			_v$3 !== _p$.e && setAttribute(_el$, "data-scrolling", _p$.e = _v$3);
			_v$4 !== _p$.t && setAttribute(_el$, "data-dragging", _p$.t = _v$4);
			_v$5 !== _p$.a && className(_el$, _p$.a = _v$5);
			return _p$;
		}, {
			e: void 0,
			t: void 0,
			a: void 0
		});
		return _el$;
	})();
}
delegateEvents([
	"pointerdown",
	"pointermove",
	"pointerup"
]);
var dict = {
	"ui.preview.controls": "Preview controls",
	"ui.preview.zoomIn": "Zoom in",
	"ui.preview.zoomOut": "Zoom out",
	"ui.preview.fit": "Fit",
	"ui.sessionReview.title": "Session changes",
	"ui.sessionReview.title.git": "Git changes",
	"ui.sessionReview.title.branch": "Branch changes",
	"ui.sessionReview.title.lastTurn": "Last turn changes",
	"ui.sessionReview.diffStyle.unified": "Unified",
	"ui.sessionReview.diffStyle.split": "Split",
	"ui.sessionReview.expandAll": "Expand all",
	"ui.sessionReview.collapseAll": "Collapse all",
	"ui.sessionReview.change.added": "Added",
	"ui.sessionReview.change.removed": "Removed",
	"ui.sessionReview.change.modified": "Modified",
	"ui.sessionReview.image.loading": "Loading…",
	"ui.sessionReview.image.placeholder": "Image",
	"ui.sessionReview.largeDiff.title": "Diff too large to render",
	"ui.sessionReview.largeDiff.meta": "Limit: {{limit}} changed lines. Current: {{current}} changed lines.",
	"ui.sessionReview.largeDiff.renderAnyway": "Render anyway",
	"ui.sessionReviewV2.expandMode": "Expand or collapse diff",
	"ui.sessionReviewV2.filterFiles": "Filter files",
	"ui.sessionReviewV2.toggleSidebar": "Toggle file tree",
	"ui.sessionReviewV2.showAllLines": "Show all lines",
	"ui.sessionReviewV2.hideNonDiffLines": "Hide non-diff lines",
	"ui.sessionReviewV2.unifiedDiff": "Unified diff",
	"ui.sessionReviewV2.splitDiff": "Split diff",
	"ui.sessionReviewV2.previousFile": "Previous file",
	"ui.sessionReviewV2.nextFile": "Next file",
	"ui.sessionReviewV2.diffView": "Diff view",
	"ui.sessionReviewV2.empty.noGit.title": "No tracked changes",
	"ui.sessionReviewV2.empty.noGit.description": "Track, review, and undo changes in this project",
	"ui.sessionReviewV2.empty.noGit.action": "Create Git repository",
	"ui.sessionReviewV2.empty.noGit.actionLoading": "Creating Git repository…",
	"ui.sessionReviewV2.empty.changes.title": "No file changes yet",
	"ui.sessionReviewV2.empty.changes.description": "Project changes will appear here",
	"ui.sessionReview.openFile": "Open file",
	"ui.sessionReview.selection.line": "line {{line}}",
	"ui.sessionReview.selection.lines": "lines {{start}}-{{end}}",
	"ui.fileMedia.kind.image": "image",
	"ui.fileMedia.kind.audio": "audio",
	"ui.fileMedia.state.removed": "Removed {{kind}} file.",
	"ui.fileMedia.state.loading": "Loading {{kind}}…",
	"ui.fileMedia.state.error": "Unable to load {{kind}}.",
	"ui.fileMedia.state.unavailable": "{{kind}} preview unavailable.",
	"ui.fileMedia.binary.title": "Binary file",
	"ui.fileMedia.binary.description.path": "{{path}} is binary.",
	"ui.fileMedia.binary.description.default": "Binary content",
	"ui.lineComment.label.prefix": "Comment on ",
	"ui.lineComment.label.suffix": "",
	"ui.lineComment.editorLabel.prefix": "Commenting on ",
	"ui.lineComment.editorLabel.suffix": "",
	"ui.lineComment.placeholder": "Add comment",
	"ui.lineComment.add": "Add comment",
	"ui.lineComment.actions": "Selection actions",
	"ui.lineComment.contextPlaceholder": "Add context for this change",
	"ui.lineComment.submit": "Comment",
	"ui.lineComment.cancel": "Cancel",
	"ui.commentCard.quote": "Quote",
	"ui.commentCard.addComment": "Add comment",
	"ui.commentCard.editComment": "Edit comment",
	"ui.sessionTurn.steps.show": "Show steps",
	"ui.sessionTurn.steps.hide": "Hide steps",
	"ui.sessionTurn.summary.response": "Response",
	"ui.sessionTurn.diff.showMore": "Show more changes ({{count}})",
	"ui.sessionTurn.diffs.changed.one": "{{count}} Changed file",
	"ui.sessionTurn.diffs.changed.other": "{{count}} Changed files",
	"ui.sessionTurn.diffs.showAll": "Show all",
	"ui.sessionTurn.diffs.showLess": "Show less",
	"ui.sessionTurn.diffs.more": "+{{count}} more files",
	"ui.sessionTurn.diffs.failed": "Diff unavailable",
	"ui.sessionTurn.diffs.retry": "Retry",
	"ui.sessionTurn.retry.retrying": "retrying",
	"ui.sessionTurn.retry.inSeconds": "in {{seconds}}s",
	"ui.sessionTurn.retry.attempt": "attempt #{{attempt}}",
	"ui.sessionTurn.retry.attemptLine": "{{line}} - attempt #{{attempt}}",
	"ui.sessionTurn.retry.attemptLabel": "Attempt {{attempt}}",
	"ui.sessionTurn.retry.attemptRetrying": "Attempt {{attempt}} - {{line}}",
	"ui.sessionTurn.retry.attemptWaiting.one": "Attempt {{attempt}} - retrying in {{count}}s",
	"ui.sessionTurn.retry.attemptWaiting.other": "Attempt {{attempt}} - retrying in {{count}}s",
	"ui.sessionTurn.retry.attemptRetryingNow": "Attempt {{attempt}} - retrying",
	"ui.sessionTurn.retry.geminiHot": "gemini is way too hot right now",
	"ui.sessionTurn.freeLimit.title": "You've used today's free messages.",
	"ui.sessionTurn.freeLimit.lineReset": "You've used today's free messages. They reset at {{time}}.",
	"ui.sessionTurn.budgetLimit.all": "Workspace budget reached · paid models paused until {{time}} · free models still work",
	"ui.sessionTurn.budgetLimit.allUntilReset": "Workspace budget reached · paid models paused until it resets · free models still work",
	"ui.sessionTurn.budgetLimit.models": "Model budget reached · this model is paused until {{time}}",
	"ui.sessionTurn.budgetLimit.modelsUntilReset": "Model budget reached · this model is paused until it resets",
	"ui.sessionTurn.budgetLimit.useFreeModel": "Use a free model",
	"ui.sessionTurn.budgetLimit.switchModel": "Switch model",
	"ui.sessionTurn.goLimit.title": "You've reached your OpenCode Go usage limit.",
	"ui.sessionTurn.goLimit.lineReset": "You've reached your OpenCode Go usage limit. It resets at {{time}}.",
	"ui.sessionTurn.error.freeUsageExceeded": "Free usage exceeded",
	"ui.sessionTurn.error.addCredits": "Add credits",
	"dialog.usageExceeded.freeTier.title": "Free limit reached",
	"dialog.usageExceeded.freeTier.description": "Subscribe to OpenCode Go for reliable access to the best open-source models for $10/month.",
	"dialog.usageExceeded.freeTier.reset": "Your free messages reset at {{time}}.",
	"dialog.usageExceeded.freeTier.actionLabel": "Subscribe",
	"ui.sessionTurn.status.delegating": "Delegating work",
	"ui.sessionTurn.status.planning": "Planning next steps",
	"ui.sessionTurn.status.gatheringContext": "Exploring",
	"ui.sessionTurn.status.gatheredContext": "Explored",
	"ui.sessionTurn.status.searchingCodebase": "Searching the codebase",
	"ui.sessionTurn.status.searchingWeb": "Searching the web",
	"ui.sessionTurn.status.makingEdits": "Making edits",
	"ui.sessionTurn.status.runningCommands": "Running commands",
	"ui.sessionTurn.status.thinking": "Thinking",
	"ui.sessionTurn.status.thinkingWithTopic": "Thinking - {{topic}}",
	"ui.sessionTurn.status.gatheringThoughts": "Gathering thoughts",
	"ui.sessionTurn.status.consideringNextSteps": "Considering next steps",
	"ui.messagePart.diagnostic.error": "Error",
	"ui.messagePart.title.edit": "Edit",
	"ui.messagePart.title.write": "Write",
	"ui.messagePart.option.typeOwnAnswer": "Type your own answer",
	"ui.messagePart.review.title": "Review your answers",
	"ui.messagePart.questions.dismissed": "Questions dismissed",
	"ui.messagePart.compaction": "Session compacted",
	"ui.messagePart.compaction.started": "Session compaction started",
	"ui.messagePart.compaction.queued": "Session compaction queued",
	"ui.messagePart.compaction.running": "Compacting",
	"ui.messagePart.compaction.done": "Compacted",
	"ui.messagePart.compaction.failed": "Session compaction failed",
	"ui.messagePart.compaction.cancelled": "Session compaction cancelled",
	"ui.messagePart.compaction.interrupted": "Session compaction interrupted",
	"ui.messagePart.providerCompaction": "Session compacted by provider",
	"ui.messagePart.compaction.usage": "{{input}} in · {{output}} out",
	"ui.messagePart.context.updates": "Updates",
	"ui.messagePart.context.read.one": "{{count}} read",
	"ui.messagePart.context.read.other": "{{count}} reads",
	"ui.messagePart.context.search.one": "{{count}} search",
	"ui.messagePart.context.search.other": "{{count}} searches",
	"ui.messagePart.context.list.one": "{{count}} list",
	"ui.messagePart.context.list.other": "{{count}} lists",
	"ui.messagePart.context.notice.one": "{{count}} Notice",
	"ui.messagePart.context.notice.other": "{{count}} Notices",
	"ui.messagePart.context.thought.one": "Thought",
	"ui.messagePart.context.thought.other": "Thoughts",
	"ui.messagePart.context.match.one": "({{count}} match)",
	"ui.messagePart.context.match.other": "({{count}} matches)",
	"ui.messagePart.context.matchCount.one": "{{count}} match",
	"ui.messagePart.context.matchCount.other": "{{count}} matches",
	"ui.messagePart.tools.used.one": "Used {{count}} {{tools}}",
	"ui.messagePart.tools.used.other": "Used {{count}} {{tools}}",
	"ui.timeline.activity.explored": "Explored",
	"ui.timeline.activity.edited": "Edited",
	"ui.timeline.activity.ran": "Ran",
	"ui.timeline.activity.used": "Used",
	"ui.timeline.activity.worked": "Worked {{duration}}",
	"ui.timeline.activity.workedUnknown": "Worked",
	"ui.timeline.activity.files.one": "{{count}} file",
	"ui.timeline.activity.files.other": "{{count}} files",
	"ui.timeline.activity.reads.one": "{{count}} read",
	"ui.timeline.activity.reads.other": "{{count}} reads",
	"ui.timeline.activity.editedFiles.one": "{{count}} edited file",
	"ui.timeline.activity.editedFiles.other": "{{count}} edited files",
	"ui.timeline.activity.searches.one": "{{count}} search",
	"ui.timeline.activity.searches.other": "{{count}} searches",
	"ui.timeline.activity.webSearches.one": "{{count}} web search",
	"ui.timeline.activity.webSearches.other": "{{count}} web searches",
	"ui.timeline.activity.pages.one": "{{count}} page",
	"ui.timeline.activity.pages.other": "{{count}} pages",
	"ui.timeline.activity.skills.one": "{{count}} skill",
	"ui.timeline.activity.skills.other": "{{count}} skills",
	"ui.timeline.activity.commands.one": "{{count}} command",
	"ui.timeline.activity.commands.other": "{{count}} commands",
	"ui.timeline.activity.subagents.one": "{{count}} subagent",
	"ui.timeline.activity.subagents.other": "{{count}} subagents",
	"ui.timeline.activity.startedShells.one": "started {{count}} shell",
	"ui.timeline.activity.startedShells.other": "started {{count}} shells",
	"ui.timeline.activity.startedSubagents.one": "started {{count}} subagent",
	"ui.timeline.activity.startedSubagents.other": "started {{count}} subagents",
	"ui.timeline.activity.finishedShells.one": "finished {{count}} shell",
	"ui.timeline.activity.finishedShells.other": "finished {{count}} shells",
	"ui.timeline.activity.finishedSubagents.one": "finished {{count}} subagent",
	"ui.timeline.activity.finishedSubagents.other": "finished {{count}} subagents",
	"ui.timeline.activity.stoppedShells.one": "stopped {{count}} shell",
	"ui.timeline.activity.stoppedShells.other": "stopped {{count}} shells",
	"ui.timeline.activity.stoppedSubagents.one": "stopped {{count}} subagent",
	"ui.timeline.activity.stoppedSubagents.other": "stopped {{count}} subagents",
	"ui.timeline.event.started": "Started",
	"ui.timeline.event.finished": "Finished",
	"ui.timeline.subagent.name": "{{name}} Agent",
	"ui.timeline.subagent.updated": "Updated",
	"ui.timeline.subagent.completed": "Completed",
	"ui.timeline.event.stopped": "Stopped",
	"ui.timeline.event.subagents.one": "{{count}} subagent",
	"ui.timeline.event.subagents.other": "{{count}} subagents",
	"ui.timeline.event.shells.one": "{{count}} shell",
	"ui.timeline.event.shells.other": "{{count}} shells",
	"ui.timeline.event.failed": "{{count}} failed",
	"ui.timeline.event.allFailed": "Failed",
	"ui.timeline.notice.agentSwitched": "Switched to {{agent}}",
	"ui.timeline.shell.exit": "Exit {{code}}",
	"ui.timeline.shell.timedOut": "Timed out",
	"ui.timeline.shell.stopped": "Stopped",
	"ui.list.loading": "Loading",
	"ui.list.empty": "No results",
	"ui.list.failed": "Failed to load results",
	"ui.list.clearFilter": "Clear filter",
	"ui.list.emptyWithFilter.prefix": "No results for",
	"ui.list.emptyWithFilter.suffix": "",
	"ui.fileSearch.placeholder": "Find",
	"ui.fileSearch.previousMatch": "Previous match",
	"ui.fileSearch.nextMatch": "Next match",
	"ui.fileSearch.close": "Close search",
	"ui.messageNav.newMessage": "New message",
	"ui.promptInput.noMatchingItems": "No matching items",
	"ui.promptInput.commands": "Commands",
	"ui.promptInput.history": "Prompt history",
	"ui.promptInput.history.search": "Search prompt history…",
	"ui.promptInput.history.contextOnly": "Prompt with context",
	"ui.promptInput.dropFiles": "Drop files to add",
	"ui.promptInput.dropFiles.image": "Drop images or files to add",
	"ui.promptInput.dropFiles.pdf": "Drop PDFs or files to add",
	"ui.promptInput.dropFiles.imagePdf": "Drop images, PDFs, or files to add",
	"ui.promptInput.removeAttachment": "Remove attachment",
	"ui.promptInput.cancelUpload": "Cancel upload",
	"ui.promptInput.uploading": "{{percent}}%",
	"ui.promptInput.label": "Prompt",
	"ui.promptInput.placeholder.shell": "Enter shell command…",
	"ui.promptInput.placeholder.normal": "Ask anything, {{slash}} for commands, {{at}} for context…",
	"ui.promptInput.placeholder.followUp": "Add follow-up, {{slash}} for commands, {{at}} for context…",
	"ui.promptInput.add": "Add images and files",
	"ui.promptInput.attachments": "Images and files",
	"ui.promptInput.context": "Context",
	"ui.promptInput.shell": "Shell command",
	"ui.promptInput.chooseAgent": "Choose agent",
	"ui.promptInput.chooseModel": "Choose model",
	"ui.promptInput.chooseVariant": "Choose model variant",
	"ui.promptInput.send": "Send",
	"ui.promptInput.stop": "Stop",
	"ui.promptInput.exitShell": "Exit",
	"ui.promptInput.steer": "Steer",
	"ui.promptInput.queue": "Queue",
	"ui.promptInput.steerHint": "Send without interrupting",
	"ui.tabs.close": "Close tab",
	"ui.redirectPaste.label": "Redirect URL",
	"ui.redirectPaste.placeholder": "http://127.0.0.1:…/callback?code=…",
	"ui.redirectPaste.required": "Paste the URL from the browser's address bar",
	"ui.textField.copyToClipboard": "Copy to clipboard",
	"ui.textField.copyLink": "Copy link",
	"ui.textField.copied": "Copied",
	"ui.imagePreview.alt": "Image preview",
	"ui.imagePreview.zoomIn": "Zoom in",
	"ui.imagePreview.zoomOut": "Zoom out",
	"ui.imagePreview.zoomToFit": "Zoom to fit",
	"ui.diagramPreview.label": "Diagram",
	"ui.diagramPreview.open": "Maximize diagram",
	"ui.scrollView.ariaLabel": "scrollable content",
	"ui.tool.read": "Read",
	"ui.tool.loaded": "Loaded",
	"ui.tool.loadedFile": "Loaded {{path}}",
	"ui.tool.loadedSkill": "Loaded {{name}} skill",
	"ui.tool.loadedSkills.one": "Loaded {{name}} skill",
	"ui.tool.loadedSkills.other": "Loaded {{name}} skills",
	"ui.tool.list": "List",
	"ui.tool.glob": "Glob",
	"ui.tool.grep": "Grep",
	"ui.tool.task": "Task",
	"ui.tool.browser": "Browser",
	"ui.tool.webfetch": "Webfetch",
	"ui.tool.websearch": "Web Search",
	"ui.tool.websearch.provider": "{{provider}} Web Search",
	"ui.tool.searchWeb": "Search web",
	"ui.tool.fetch": "Fetch",
	"ui.tool.shell": "Shell",
	"ui.tool.shell.writingCommand": "Writing command…",
	"ui.tool.shell.exit": "Command exited with code {{code}}",
	"ui.tool.shell.timeout": "Command timed out",
	"ui.tool.shell.cancelled": "Command cancelled",
	"ui.tool.execute": "Execute",
	"ui.tool.execute.viewCode": "View code",
	"ui.tool.execute.code": "Code",
	"ui.tool.execute.output": "Output",
	"ui.tool.execute.error": "Error",
	"ui.tool.execute.copyCode": "Copy code",
	"ui.tool.execute.copyOutput": "Copy output",
	"ui.tool.execute.running": "Running",
	"ui.tool.execute.completed": "Completed",
	"ui.tool.execute.calls.one": "{{count}} call",
	"ui.tool.execute.calls.other": "{{count}} calls",
	"ui.tool.execute.lines.one": "{{count}} line",
	"ui.tool.execute.lines.other": "{{count}} lines",
	"ui.tool.patch": "Patch",
	"ui.tool.questions": "Questions",
	"ui.tool.questions.numbered": "Questions {{number}}",
	"ui.tool.agent": "{{type}} Agent",
	"ui.tool.agent.default": "Agent",
	"ui.tool.agent.delegating": "Delegating agent…",
	"ui.tool.skill": "Skill",
	"ui.basicTool.called": "Called `{{tool}}`",
	"ui.toolErrorCard.failed": "Failed",
	"ui.toolErrorCard.copyError": "Copy error",
	"ui.common.file.one": "file",
	"ui.common.file.other": "files",
	"ui.common.fileCount.one": "{{count}} file",
	"ui.common.fileCount.other": "{{count}} files",
	"ui.common.question.one": "question",
	"ui.common.question.other": "questions",
	"ui.common.add": "Add",
	"ui.common.clear": "Clear",
	"ui.common.file": "File",
	"ui.common.back": "Back",
	"ui.common.cancel": "Cancel",
	"ui.common.confirm": "Confirm",
	"ui.common.dismiss": "Dismiss",
	"ui.common.close": "Close",
	"ui.common.next": "Next",
	"ui.common.continue": "Continue",
	"ui.common.submit": "Submit",
	"ui.common.showMore": "Show more",
	"ui.common.showLess": "Show less",
	"ui.common.moreCount.one": "+{{count}} more",
	"ui.common.moreCount.other": "+{{count}} more",
	"ui.permission.deny": "Deny",
	"ui.permission.allowAlways": "Allow always",
	"ui.permission.allowOnce": "Allow once",
	"ui.message.expand": "Expand message",
	"ui.message.collapse": "Collapse message",
	"ui.message.readMore": "Read more",
	"ui.message.showLess": "Show less",
	"ui.message.copy": "Copy",
	"ui.message.wrapLines": "Wrap lines",
	"ui.message.unwrapLines": "Don't wrap lines",
	"ui.message.copyMessage": "Copy message",
	"ui.message.copyFullMessage": "Copy full message",
	"ui.message.forkMessage": "Fork from here",
	"ui.message.revertMessage": "Revert to here",
	"ui.message.undoMessage": "Undo",
	"ui.message.moreActions": "More actions",
	"ui.message.moveToQueue": "Move to queue",
	"ui.message.pending": "Pending",
	"ui.message.voice": "Voice",
	"ui.message.deletePending": "Delete",
	"ui.message.copyResponse": "Copy response",
	"ui.message.copyOutput": "Copy output",
	"ui.message.copied": "Copied",
	"ui.message.thought": "Thought",
	"ui.message.duration.seconds": "{{count}}s",
	"ui.message.duration.minutesSeconds": "{{minutes}}m {{seconds}}s",
	"ui.message.duration.hoursMinutes": "{{hours}}h {{minutes}}m",
	"ui.message.tokensPerSecond": "{{value}} tok/s",
	"ui.message.interrupted": "Interrupted",
	"ui.message.modelVariant": "{{model}} ({{variant}})",
	"ui.message.time.justNow": "Just now",
	"ui.message.time.minutesAgo": "{{count}}m ago",
	"ui.message.time.hoursAgo": "{{count}}h ago",
	"ui.message.time.daysAgo": "{{count}}d ago",
	"ui.sources.count.one": "{{count}} source",
	"ui.sources.count.other": "{{count}} sources",
	"ui.sources.none": "No sources",
	"ui.sources.title": "Sources",
	"ui.sources.searched": "Searched web",
	"ui.sources.searchFailed": "Search failed",
	"ui.sources.noResults": "No results",
	"ui.sources.opened": "Opened page",
	"ui.sources.openFailed": "Couldn’t open page",
	"ui.sessionTimeline.notice.model": "Model",
	"ui.sessionTimeline.notice.modelSwitched": "Switched to {{model}}",
	"ui.sessionTimeline.notice.variantSwitched": "Switched variant to {{variant}}",
	"ui.sessionTimeline.notice.variantDefault": "Switched variant to Default",
	"ui.sessionTimeline.notice.agentChanged": "Agent changed",
	"ui.sessionTimeline.notice.movedTo": "Moved to",
	"ui.sessionTimeline.notice.movedTooltip": "Session working directory changed",
	"ui.sessionTimeline.notice.failed": "{{actor}} failed",
	"ui.sessionTimeline.notice.cancelled": "{{actor}} cancelled",
	"ui.sessionTimeline.notice.finished": "{{actor}} finished",
	"ui.sessionTimeline.notice.instructionsUpdated": "Instructions updated",
	"ui.sessionTimeline.notice.restart": "Continuing after restart",
	"ui.message.queued": "Queued",
	"ui.message.attachment.alt": "attachment",
	"ui.patch.action.deleted": "Deleted",
	"ui.patch.action.created": "Created",
	"ui.patch.action.moved": "Moved",
	"ui.patch.action.patched": "Patched",
	"ui.question.subtitle.answered": "{{count}} answered",
	"ui.question.answer.none": "(no answer)",
	"ui.question.review.notAnswered": "(not answered)",
	"ui.question.multiHint": "Pick any",
	"ui.question.singleHint": "Select one answer",
	"ui.question.classic.multiHint": "Select all answers that apply",
	"ui.question.custom.placeholder": "Type your answer…",
	"ui.question.custom.answerPlaceholder": "Type your own answer…"
};
var rules = /* @__PURE__ */ new Map();
function pluralCategory(locale, count) {
	const cached = rules.get(locale);
	if (cached) return cached.select(count);
	const next = new Intl.PluralRules(locale);
	if (rules.size >= 32) rules.delete(rules.keys().next().value);
	rules.set(locale, next);
	return next.select(count);
}
function pluralKey(key, category) {
	return `${key}.${category}`;
}
function localizedListSeparator(locale, index, count) {
	if (index <= 0 || index >= count) return "";
	const parts = new Intl.ListFormat(locale, {
		style: "long",
		type: "conjunction"
	}).formatToParts(Array.from({ length: count }, (_, item) => String(item)));
	const current = parts.findIndex((part) => part.type === "element" && part.value === String(index));
	const previous = parts.findLastIndex((part, partIndex) => partIndex < current && part.type === "element" && part.value === String(index - 1));
	return parts.slice(previous + 1, current).map((part) => part.value).join("");
}
function resolveTemplate(text, params) {
	if (!params) return text;
	return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
		const value = params[String(rawKey)];
		return value === void 0 ? "" : String(value);
	});
}
function createUiI18n(source) {
	return {
		...source,
		tDynamic: (key, value, params) => source.locale().toLowerCase().split("-")[0] === "en" ? resolveTemplate(value, params) : source.t(key, params),
		list: (items) => source.locale().toLowerCase().split("-")[0] === "en" ? items.join(", ") : new Intl.ListFormat(source.locale(), {
			style: "long",
			type: "conjunction"
		}).format(items),
		listSeparator: (index, count) => source.locale().toLowerCase().split("-")[0] === "en" ? index > 0 && index < count ? "," : "" : localizedListSeparator(source.locale(), index, count)
	};
}
var fallback = createUiI18n({
	locale: () => "en",
	t: (key, params) => {
		return resolveTemplate(dict[key] ?? String(key), params);
	},
	plural: (key, count, params) => fallback.pluralForm(key, pluralCategory(fallback.locale(), count), {
		...params,
		count
	}),
	pluralForm: (key, category, params) => {
		const values = dict;
		return resolveTemplate(values[pluralKey(key, category)] ?? values[`${key}.other`] ?? `${key}.other`, params);
	}
});
var Context = createContext(fallback);
function useI18n() {
	return useContext(Context);
}
var _tmpl$$2 = /*#__PURE__*/ template(`<span data-slot=text-input-v2-leading-icon>`);
var _tmpl$2$2 = /*#__PURE__*/ template(`<button type=button data-slot=text-input-v2-icon-button>`);
var _tmpl$3$2 = /*#__PURE__*/ template(`<div data-slot=text-input-v2-trailing>`);
var _tmpl$4$2 = /*#__PURE__*/ template(`<div data-component=text-input-v2><div data-slot=text-input-v2-value><input>`);
function TextInput(props) {
	const i18n = useI18n();
	const [local, inputProps] = splitProps(props, [
		"class",
		"classList",
		"leadingIcon",
		"trailing",
		"showCopyButton",
		"showClearButton",
		"clearIcon",
		"copyLabel",
		"clearLabel",
		"onCopyClick",
		"onClearClick",
		"numeric",
		"invalid",
		"appearance",
		"surface",
		"disabled"
	]);
	return (() => {
		var _el$ = _tmpl$4$2(), _el$2 = _el$.firstChild, _el$4 = _el$2.firstChild;
		insert(_el$2, createComponent(Show, {
			get when() {
				return local.leadingIcon;
			},
			get children() {
				var _el$3 = _tmpl$$2();
				insert(_el$3, () => local.leadingIcon);
				return _el$3;
			}
		}), _el$4);
		spread(_el$4, mergeProps(inputProps, {
			get type() {
				return inputProps.type ?? "text";
			},
			get disabled() {
				return local.disabled;
			},
			get ["aria-invalid"]() {
				return local.invalid ? true : void 0;
			},
			"data-slot": "text-input-v2-input"
		}), false, false);
		insert(_el$, createComponent(Show, {
			get when() {
				return local.showClearButton || local.showCopyButton;
			},
			get children() {
				var _el$5 = _tmpl$2$2();
				_el$5.$$click = (event) => {
					if (local.showClearButton) {
						local.onClearClick?.(event);
						return;
					}
					local.onCopyClick?.(event);
				};
				_el$5.$$mousedown = (event) => {
					if (!local.showClearButton) return;
					event.preventDefault();
				};
				insert(_el$5, createComponent(Icon, { get name() {
					return memo(() => !!local.showClearButton)() ? local.clearIcon ?? "close" : "copy";
				} }));
				effect((_p$) => {
					var _v$ = local.showClearButton ? "clear" : "copy", _v$2 = local.showClearButton ? local.clearLabel ?? i18n.t("ui.common.clear") : local.copyLabel ?? i18n.t("ui.message.copy"), _v$3 = local.disabled;
					_v$ !== _p$.e && setAttribute(_el$5, "data-variant", _p$.e = _v$);
					_v$2 !== _p$.t && setAttribute(_el$5, "aria-label", _p$.t = _v$2);
					_v$3 !== _p$.a && (_el$5.disabled = _p$.a = _v$3);
					return _p$;
				}, {
					e: void 0,
					t: void 0,
					a: void 0
				});
				return _el$5;
			}
		}), null);
		insert(_el$, createComponent(Show, {
			get when() {
				return local.trailing;
			},
			get children() {
				var _el$6 = _tmpl$3$2();
				insert(_el$6, () => local.trailing);
				return _el$6;
			}
		}), null);
		effect((_p$) => {
			var _v$4 = local.disabled ? "" : void 0, _v$5 = local.invalid ? "" : void 0, _v$6 = local.numeric ? "" : void 0, _v$7 = local.appearance ?? "base", _v$8 = local.surface ?? "base", _v$9 = local.leadingIcon ? "" : void 0, _v$0 = {
				...local.classList,
				[local.class ?? ""]: !!local.class
			};
			_v$4 !== _p$.e && setAttribute(_el$, "data-disabled", _p$.e = _v$4);
			_v$5 !== _p$.t && setAttribute(_el$, "data-invalid", _p$.t = _v$5);
			_v$6 !== _p$.a && setAttribute(_el$, "data-numeric", _p$.a = _v$6);
			_v$7 !== _p$.o && setAttribute(_el$, "data-appearance", _p$.o = _v$7);
			_v$8 !== _p$.i && setAttribute(_el$, "data-surface", _p$.i = _v$8);
			_v$9 !== _p$.n && setAttribute(_el$, "data-leading-icon", _p$.n = _v$9);
			_p$.s = classList(_el$, _v$0, _p$.s);
			return _p$;
		}, {
			e: void 0,
			t: void 0,
			a: void 0,
			o: void 0,
			i: void 0,
			n: void 0,
			s: void 0
		});
		return _el$;
	})();
}
delegateEvents(["mousedown", "click"]);
/** The active row, keys and combobox ids for a search input above a list of options. */
function createTypeahead(props) {
	const id = createUniqueId();
	const [store, setStore] = createStore({});
	const chosen = () => props.items().find((item) => props.key(item) === store.active && !props.stale?.(item));
	createEffect(() => {
		if (store.active !== void 0 && chosen() === void 0) setStore("active", void 0);
	});
	const activeItem = createMemo(() => chosen() ?? props.items()[0]);
	const optionID = (item) => `${id}-${encodeURIComponent(props.key(item))}`;
	return {
		activeItem,
		setActive: (key) => setStore("active", key),
		listID: `${id}-list`,
		optionID,
		activeID: () => {
			const item = activeItem();
			return item === void 0 ? void 0 : optionID(item);
		},
		onKeyDown: (event) => {
			if (event.isComposing) return;
			const items = props.items();
			const delta = !(!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) ? 0 : event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
			if (delta !== 0 || event.key === "Enter" || event.key === "Escape" && props.onClose) {
				event.preventDefault();
				event.stopPropagation();
			}
			if (delta !== 0 && items.length > 0) {
				const index = items.findIndex((item) => item === activeItem());
				setStore("active", props.key(items[(index + delta + items.length) % items.length]));
			}
			const item = activeItem();
			if (event.key === "Enter" && item !== void 0) props.onSelect(item);
			if (event.key === "Escape") props.onClose?.();
		}
	};
}
/** The move a key asks of a search list, or nothing when the key belongs to the input. */
function searchListMove(event) {
	if (event.shiftKey || event.ctrlKey) return;
	const section = event.metaKey || event.altKey;
	if (event.key === "ArrowDown") return section ? "nextSection" : "next";
	if (event.key === "ArrowUp") return section ? "previousSection" : "previous";
	if (section) return;
	if (event.key === "Home") return "first";
	if (event.key === "End") return "last";
}
/**
* The row a move lands on, given each row's section key. Arrows wrap. A section move lands on a section's first row:
* up goes to the start of the current section first, as a paragraph jump does, then to the previous one.
*/
function searchListTarget(sections, index, move) {
	const count = sections.length;
	if (count === 0) return -1;
	if (move === "first") return 0;
	if (move === "last") return count - 1;
	if (move === "next") return (index + 1) % count;
	if (move === "previous") return index <= 0 ? count - 1 : index - 1;
	const start = (at) => {
		const found = sections.slice(0, at + 1).findLastIndex((key, i) => i === 0 || sections[i - 1] !== key);
		return Math.max(found, 0);
	};
	const current = start(Math.max(index, 0));
	if (move === "previousSection") {
		if (index > current) return current;
		return current === 0 ? start(count - 1) : start(current - 1);
	}
	const next = sections.findIndex((key, i) => i > current && key !== sections[current]);
	return next === -1 ? 0 : next;
}
var _tmpl$$1 = /*#__PURE__*/ template(`<div data-slot=search-list-fade aria-hidden=true>`);
var _tmpl$2$1 = /*#__PURE__*/ template(`<div data-slot=search-list-results role=listbox>`);
var _tmpl$3$1 = /*#__PURE__*/ template(`<div data-slot=search-list-empty>`);
var _tmpl$4$1 = /*#__PURE__*/ template(`<div data-slot=search-list-footer>`);
var _tmpl$5$1 = /*#__PURE__*/ template(`<div data-component=search-list><div data-slot=search-list-body>`);
var _tmpl$6$1 = /*#__PURE__*/ template(`<div data-slot=search-list-search>`);
var _tmpl$7$1 = /*#__PURE__*/ template(`<div data-slot=search-list-section role=group>`);
var _tmpl$8$1 = /*#__PURE__*/ template(`<div data-slot=search-list-header>`);
var _tmpl$9 = /*#__PURE__*/ template(`<mark data-slot=search-list-match>`);
var QueryContext = createContext(() => "");
/**
* A search field over sectioned results. Rows that share a `section` key list together under one header, which sticks
* while its rows scroll beneath it until the next header pushes it away. The first row is active until the user picks
* another: ↑/↓ wrap, ⌘ or ⌥ with ↑/↓ jump between sections, Home/End go to the ends, Enter selects and Escape closes.
* A page can keep its own field through `field` and float the results beneath it with `popover`.
*/
function SearchList(props) {
	let viewport;
	let results;
	const sectionOf = (item) => props.section?.(item) ?? "";
	const open = () => props.open ?? true;
	const groups = createMemo(() => {
		const all = /* @__PURE__ */ new Map();
		props.items.forEach((item) => {
			const list = all.get(sectionOf(item));
			if (list) list.push(item);
			else all.set(sectionOf(item), [item]);
		});
		return all;
	});
	const rows = createMemo(() => [...groups().values()].flat());
	const byKey = createMemo(() => new Map(rows().map((item) => [props.key(item), item])));
	const sectionKeys = createMemo((previous) => stable(previous, [...groups().keys()]));
	const typeahead = createTypeahead({
		items: rows,
		key: (item) => props.key(item),
		onSelect: (item) => props.onSelect(item),
		onClose: props.onClose && (() => props.onClose?.())
	});
	const activeKey = createMemo(() => {
		const item = typeahead.activeItem();
		return item === void 0 ? void 0 : props.key(item);
	});
	const isActive = createSelector(activeKey);
	const reveal = () => {
		const item = typeahead.activeItem();
		if (!viewport) return;
		if (item === void 0 || item === rows()[0]) return viewport.scrollTo({ top: 0 });
		document.getElementById(typeahead.optionID(item))?.scrollIntoView({ block: "nearest" });
	};
	let sections = [];
	const edges = () => {
		if (!viewport) return;
		const scroll = viewport.scrollTop;
		const strength = (hidden) => String(Math.min(1, Math.max(0, hidden / 15)));
		const current = sections.findLast((section) => section.top - scroll < section.header);
		const offset = current?.header ? Math.min(Math.max(current.top - scroll, 0) + current.header, current.bottom - scroll) : 0;
		viewport.style.setProperty("--search-list-fade-offset", `${Math.max(0, offset)}px`);
		viewport.style.setProperty("--search-list-fade-top", strength(current ? scroll - current.top : 0));
		viewport.style.setProperty("--search-list-fade-bottom", strength(viewport.scrollHeight - viewport.clientHeight - scroll));
	};
	const measure = () => {
		if (!viewport) return;
		const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
		sections = [...viewport.querySelectorAll("[data-slot=\"search-list-section\"]")].map((section) => {
			const rect = section.getBoundingClientRect();
			return {
				top: rect.top - origin,
				bottom: rect.bottom - origin - parseFloat(getComputedStyle(section).paddingBottom),
				header: section.querySelector("[data-slot=\"search-list-header\"]")?.offsetHeight ?? 0
			};
		});
		edges();
	};
	createResizeObserver(() => [viewport, results], measure);
	createEffect(on(rows, measure, { defer: true }));
	createEffect(() => props.onActive?.(typeahead.activeItem()));
	let revealed = props.query;
	let pointed;
	createEffect(on(rows, (all) => {
		const fresh = props.query !== revealed;
		revealed = props.query;
		if (!fresh && (typeahead.activeItem() === all[0] || activeKey() === pointed)) return;
		const frame = requestAnimationFrame(reveal);
		onCleanup(() => cancelAnimationFrame(frame));
	}, { defer: true }));
	const choose = (key) => {
		pointed = void 0;
		typeahead.setActive(key);
	};
	props.ref?.({
		active: typeahead.activeItem,
		setActive: choose
	});
	const onKeyDown = (event) => {
		if (event.isComposing) return;
		props.onKeyDown?.(event, typeahead.activeItem());
		if (event.defaultPrevented || !open()) return;
		const move = searchListMove(event);
		if (!move) return typeahead.onKeyDown(event);
		event.preventDefault();
		event.stopPropagation();
		const all = rows();
		const sections = all.map(sectionOf);
		const active = typeahead.activeItem();
		const from = active === void 0 ? -1 : all.indexOf(active);
		const step = (index) => {
			const next = searchListTarget(sections, index, move);
			return (move === "next" || move === "previous") && active !== void 0 && next !== from && props.same?.(all[next], active) ? step(next) : next;
		};
		const target = all[step(from)];
		if (target === void 0) return;
		choose(props.key(target));
		reveal();
	};
	onMount(() => {
		if (viewport && props.scrollTop) viewport.scrollTop = props.scrollTop;
	});
	const field = {
		role: "combobox",
		get "aria-expanded"() {
			return open();
		},
		"aria-autocomplete": "list",
		get "aria-controls"() {
			return open() ? typeahead.listID : void 0;
		},
		get "aria-activedescendant"() {
			return open() ? typeahead.activeID() : void 0;
		},
		onInput: (event) => {
			choose(void 0);
			props.onQuery(event.currentTarget.value);
		},
		onKeyDown
	};
	const row = (key, item) => ({
		get id() {
			return typeahead.optionID(item());
		},
		role: "option",
		get "aria-selected"() {
			return isActive(key);
		},
		"data-slot": "search-list-row",
		get "data-active"() {
			return isActive(key) ? "" : void 0;
		},
		onMouseMove: (event) => {
			if (event.movementX === 0 && event.movementY === 0) return;
			pointed = key;
			typeahead.setActive(key);
		},
		onMouseDown: (event) => event.preventDefault(),
		onClick: () => props.onSelect(item())
	});
	const needle = createMemo(() => props.query.trim().toLowerCase());
	return createComponent(QueryContext.Provider, {
		value: needle,
		get children() {
			var _el$ = _tmpl$5$1(), _el$2 = _el$.firstChild;
			insert(_el$, createComponent(Show, {
				get when() {
					return props.field;
				},
				get fallback() {
					return (() => {
						var _el$7 = _tmpl$6$1();
						insert(_el$7, createComponent(TextInput, mergeProps(field, {
							get value() {
								return props.query;
							},
							autofocus: true,
							autocomplete: "off",
							autocorrect: "off",
							autocapitalize: "off",
							spellcheck: false,
							appearance: "large",
							get placeholder() {
								return props.placeholder;
							},
							get ["aria-label"]() {
								return props.placeholder;
							},
							get leadingIcon() {
								return createComponent(Icon, { name: "magnifying-glass" });
							},
							get trailing() {
								return props.trailing;
							}
						})));
						return _el$7;
					})();
				},
				children: (custom) => custom()(field)
			}), _el$2);
			insert(_el$2, createComponent(MenuScroll, {
				"data-slot": "search-list-scroll",
				viewportRef: (element) => viewport = element,
				onScroll: (event) => {
					edges();
					props.onScroll?.(event.currentTarget.scrollTop);
				},
				get children() {
					return [
						_tmpl$$1(),
						(() => {
							var _el$4 = _tmpl$2$1();
							var _ref$ = results;
							typeof _ref$ === "function" ? use(_ref$, _el$4) : results = _el$4;
							insert(_el$4, createComponent(For, {
								get each() {
									return sectionKeys();
								},
								children: (section) => {
									const keys = createMemo((previous) => stable(previous, (groups().get(section) ?? []).map(props.key)));
									const first = () => byKey().get(keys()[0] ?? "");
									const header = createMemo(() => props.header && first() !== void 0 ? props.header(first()) : void 0);
									const id = `${typeahead.listID}-section-${encodeURIComponent(section)}`;
									return (() => {
										var _el$8 = _tmpl$7$1();
										insert(_el$8, createComponent(Show, {
											get when() {
												return header();
											},
											children: (content) => (() => {
												var _el$9 = _tmpl$8$1();
												setAttribute(_el$9, "id", id);
												insert(_el$9, content);
												return _el$9;
											})()
										}), null);
										insert(_el$8, createComponent(For, {
											get each() {
												return keys();
											},
											children: (key) => {
												const item = createMemo((previous) => byKey().get(key) ?? previous, byKey().get(key));
												return props.children(item, row(key, item));
											}
										}), null);
										effect(() => setAttribute(_el$8, "aria-labelledby", header() ? id : void 0));
										return _el$8;
									})();
								}
							}));
							effect((_p$) => {
								var _v$ = typeahead.listID, _v$2 = rows().length === 0, _v$3 = props.label ?? props.placeholder;
								_v$ !== _p$.e && setAttribute(_el$4, "id", _p$.e = _v$);
								_v$2 !== _p$.t && (_el$4.hidden = _p$.t = _v$2);
								_v$3 !== _p$.a && setAttribute(_el$4, "aria-label", _p$.a = _v$3);
								return _p$;
							}, {
								e: void 0,
								t: void 0,
								a: void 0
							});
							return _el$4;
						})(),
						createComponent(Show, {
							get when() {
								return rows().length === 0;
							},
							get children() {
								var _el$5 = _tmpl$3$1();
								insert(_el$5, () => props.empty);
								return _el$5;
							}
						})
					];
				}
			}), null);
			insert(_el$2, createComponent(Show, {
				get when() {
					return props.footer;
				},
				get children() {
					var _el$6 = _tmpl$4$1();
					insert(_el$6, () => props.footer);
					return _el$6;
				}
			}), null);
			effect((_p$) => {
				var _v$4 = props.popover ? "" : void 0, _v$5 = props.class, _v$6 = !open();
				_v$4 !== _p$.e && setAttribute(_el$, "data-popover", _p$.e = _v$4);
				_v$5 !== _p$.t && className(_el$, _p$.t = _v$5);
				_v$6 !== _p$.a && (_el$2.hidden = _p$.a = _v$6);
				return _p$;
			}, {
				e: void 0,
				t: void 0,
				a: void 0
			});
			return _el$;
		}
	});
}
/** Text with its first match for the list's query marked. One mark per row keeps short queries from speckling the list. */
function SearchHighlight(props) {
	const needle = useContext(QueryContext);
	const haystack = createMemo(() => props.text.toLowerCase());
	const match = createMemo(() => {
		const at = needle() ? haystack().indexOf(needle()) : -1;
		if (at === -1 || haystack().length !== props.text.length) return;
		return {
			at,
			end: at + needle().length
		};
	});
	return createComponent(Show, {
		get when() {
			return match();
		},
		get fallback() {
			return props.text;
		},
		children: (range) => [
			memo(() => props.text.slice(0, range().at)),
			(() => {
				var _el$0 = _tmpl$9();
				insert(_el$0, () => props.text.slice(range().at, range().end));
				return _el$0;
			})(),
			memo(() => props.text.slice(range().end))
		]
	});
}
function stable(previous, next) {
	return previous && previous.length === next.length && previous.every((value, index) => value === next[index]) ? previous : next;
}
/**
* 6px beside the row's end edge, else its start edge, else over the layer, level with the row unless that would cross
* the layer's top or bottom edge: always inside the layer that holds it. `height` is the flyout's, 0 until it renders.
*/
function placeFlyout(row, layer, rtl, height) {
	const fits = (x) => !layer || x >= layer.left && x + 160 <= layer.right;
	const end = rtl ? row.left - 6 - 160 : row.right + 6;
	const start = rtl ? row.right + 6 : row.left - 6 - 160;
	const over = layer ? Math.max(layer.left, Math.min(end, layer.right - 160)) : end;
	const left = fits(end) ? end : fits(start) ? start : over;
	const top = row.top - 2;
	if (!layer) return {
		left,
		top
	};
	return {
		left,
		top: Math.max(layer.top + 6, Math.min(top, layer.bottom - 6 - height))
	};
}
var _tmpl$ = /*#__PURE__*/ template(`<div data-agent-palette class="model-dialog command-palette-body">`);
var _tmpl$2 = /*#__PURE__*/ template(`<span data-slot=model-dialog-header-label>`);
var _tmpl$3 = /*#__PURE__*/ template(`<div data-agent-page-heading tabindex=0>`);
var _tmpl$4 = /*#__PURE__*/ template(`<span data-slot=model-dialog-variant><span class="truncate capitalize">`);
var _tmpl$5 = /*#__PURE__*/ template(`<button type=button><span data-slot=model-dialog-check></span><span data-slot=model-dialog-name><span class="min-w-0 truncate">`);
var _tmpl$6 = /*#__PURE__*/ template(`<span class="min-w-0 truncate text-v2-text-text-faint">`);
var _tmpl$7 = /*#__PURE__*/ template(`<div data-agent-variants data-component=menu-v2-content data-slot=model-dialog-flyout role=menu aria-label="Model variant"style=z-index:3>`);
var _tmpl$8 = /*#__PURE__*/ template(`<button type=button data-component=menu-v2-item role=menuitemradio><span class=capitalize data-slot=menu-v2-item-content>`);
function desktopPages(ui, renderTabs) {
	const [page, setPage] = createSignal({
		title: "Manage agents",
		rows: [],
		actions: [],
		search: true
	});
	const [query, setQuery] = createSignal(""), [fly, setFly] = createSignal();
	let pending, closed = false, root, input, handle, timer;
	function clearFly() {
		clearTimeout(timer);
		setFly(void 0);
	}
	function finish(value) {
		if (!pending) return;
		const resolve = pending;
		pending = void 0;
		clearFly();
		resolve(value);
	}
	function show(row, element, focus = false) {
		clearTimeout(timer);
		if (!element || !row?.variants?.length) return clearFly();
		const content = root.closest("[data-slot=\"dialog-content\"]") ?? root;
		const layer = {
			top: 0,
			left: 0,
			right: window.innerWidth,
			bottom: window.innerHeight
		};
		const at = placeFlyout(element.getBoundingClientRect(), layer, getComputedStyle(root).direction === "rtl", (row.variants.length + 1) * 28 + 4);
		setFly({
			row,
			at,
			content
		});
		if (focus) queueMicrotask(() => content.querySelector("[data-agent-variants] [aria-checked=\"true\"]")?.focus());
	}
	function view() {
		const items = createMemo(() => {
			const q = query().trim().toLowerCase();
			return page().rows.filter((r) => !q || [
				r.title,
				r.description,
				r.meta,
				r.group,
				r.value
			].some((v) => v?.toLowerCase().includes(q)));
		});
		onMount(() => {
			input = root.querySelector("input");
			input?.focus();
			if (!renderTabs) return;
			const mount = document.createElement("div");
			root.querySelector("[data-slot=\"search-list-body\"]")?.before(mount);
			insert(mount, () => Number.isInteger(page().slot) ? renderTabs(page(), finish) : null);
		});
		onCleanup(clearFly);
		const placeholder = () => page().title === "Manage agents" ? "Search agents" : page().title.endsWith(" · Default model") ? `Search models for ${page().title.split(" · ")[0]}` : "Search models";
		function keys(e, row) {
			if (e.key === "ArrowRight" && row?.variants?.length) {
				e.preventDefault();
				show(row, document.getElementById(root.querySelector("input")?.getAttribute("aria-activedescendant")), true);
			} else if (e.key === "Escape" && fly()) {
				e.preventDefault();
				e.stopPropagation();
				clearFly();
			} else clearFly();
		}
		return (() => {
			var _el$ = _tmpl$();
			_el$.addEventListener("wheel", clearFly);
			var _ref$ = root;
			typeof _ref$ === "function" ? use(_ref$, _el$) : root = _el$;
			insert(_el$, createComponent(SearchList, {
				ref: (h) => handle = h,
				get items() {
					return items();
				},
				get query() {
					return query();
				},
				onQuery: (v) => {
					clearFly();
					setQuery(v);
				},
				get placeholder() {
					return placeholder();
				},
				get label() {
					return page().title;
				},
				key: (r) => r.value,
				section: (r) => r.group ?? "",
				header: (r) => r.group && (() => {
					var _el$2 = _tmpl$2();
					insert(_el$2, () => r.group);
					return _el$2;
				})(),
				empty: pending ? "No matches" : "Loading…",
				onKeyDown: keys,
				get field() {
					return page().search ? void 0 : (attrs) => (() => {
						var _el$3 = _tmpl$3();
						addEventListener(_el$3, "keydown", attrs.onKeyDown, true);
						insert(_el$3, () => page().title);
						return _el$3;
					})();
				},
				get trailing() {
					return createComponent(For, {
						get each() {
							return page().actions;
						},
						children: (a) => createComponent(ui.Tooltip, {
							get value() {
								return a.title;
							},
							get children() {
								return createComponent(ui.IconButton, {
									icon: "reset",
									get label() {
										return a.title;
									},
									get disabled() {
										return a.disabled;
									},
									onClick: () => finish(a.value)
								});
							}
						})
					});
				},
				onSelect: (r) => finish(r.variants ? {
					ref: r.value,
					variant: r.variant
				} : r.value),
				children: (item, attrs) => (() => {
					var _el$4 = _tmpl$5(), _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling, _el$7 = _el$6.firstChild;
					spread(_el$4, mergeProps(attrs, { "onMouseMove": (e) => {
						attrs.onMouseMove(e);
						if (!(e.movementX || e.movementY) || fly()?.row === item()) return;
						const el = e.currentTarget;
						clearTimeout(timer);
						timer = setTimeout(() => show(item(), el), 100);
					} }), false, true);
					insert(_el$5, createComponent(Show, {
						get when() {
							return item().checked;
						},
						get children() {
							return createComponent(Icon, { name: "check" });
						}
					}));
					insert(_el$7, createComponent(SearchHighlight, { get text() {
						return item().title;
					} }));
					insert(_el$6, createComponent(Show, {
						get when() {
							return item().meta ?? (item().value !== item().description && item().description);
						},
						children: (text) => (() => {
							var _el$0 = _tmpl$6();
							insert(_el$0, text);
							return _el$0;
						})()
					}), null);
					insert(_el$4, createComponent(Show, {
						get when() {
							return memo(() => !!item().variants?.length)() && attrs["aria-selected"];
						},
						get children() {
							var _el$8 = _tmpl$4(), _el$9 = _el$8.firstChild;
							_el$8.$$click = (e) => {
								e.stopPropagation();
								show(item(), e.currentTarget.closest("button"), true);
							};
							insert(_el$9, () => item().variant || "Default");
							insert(_el$8, createComponent(Icon, { name: "chevron-right" }), null);
							return _el$8;
						}
					}), null);
					return _el$4;
				})()
			}), null);
			insert(_el$, createComponent(Show, {
				get when() {
					return fly();
				},
				children: (f) => createComponent(Portal, {
					get mount() {
						return f().content;
					},
					get children() {
						var _el$1 = _tmpl$7();
						_el$1.$$keydown = (e) => {
							if (["Escape", "ArrowLeft"].includes(e.key)) {
								e.stopPropagation();
								e.preventDefault();
								clearFly();
								root.querySelector("input")?.focus();
								return;
							}
							const buttons = [...e.currentTarget.querySelectorAll("button")], i = buttons.indexOf(document.activeElement);
							if (["ArrowUp", "ArrowDown"].includes(e.key)) {
								e.preventDefault();
								buttons[(i + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length].focus();
							}
						};
						insert(_el$1, createComponent(For, {
							get each() {
								return ["", ...f().row.variants];
							},
							children: (v) => (() => {
								var _el$10 = _tmpl$8(), _el$11 = _el$10.firstChild;
								_el$10.$$click = () => finish({
									ref: f().row.value,
									variant: v
								});
								insert(_el$11, v || "Default");
								insert(_el$10, createComponent(Show, {
									get when() {
										return (f().row.variant || "") === v;
									},
									get children() {
										return createComponent(Icon, { name: "check" });
									}
								}), null);
								effect(() => setAttribute(_el$10, "aria-checked", (f().row.variant || "") === v));
								return _el$10;
							})()
						}));
						effect((_p$) => {
							var _v$ = `${f().at.left}px`, _v$2 = `${f().at.top}px`;
							_v$ !== _p$.e && setStyleProperty(_el$1, "left", _p$.e = _v$);
							_v$2 !== _p$.t && setStyleProperty(_el$1, "top", _p$.t = _v$2);
							return _p$;
						}, {
							e: void 0,
							t: void 0
						});
						return _el$1;
					}
				})
			}), null);
			return _el$;
		})();
	}
	return {
		view,
		close() {
			closed = true;
			finish(void 0);
			clearFly();
		},
		select(rows, settings) {
			if (closed) return Promise.resolve();
			const samePicker = Number.isInteger(settings.slot) && Number.isInteger(page().slot);
			return new Promise((resolve) => {
				pending = resolve;
				batch(() => {
					clearFly();
					if (!samePicker) setQuery("");
					setPage({
						...settings,
						rows
					});
					if (!samePicker) handle?.setActive(void 0);
				});
				if (samePicker) return;
				(root?.querySelector("input,[data-agent-page-heading]"))?.focus({ preventScroll: true });
				root?.querySelector("[data-scrollable]")?.scrollTo({ top: 0 });
			});
		}
	};
}
delegateEvents(["keydown", "click"]);
export { desktopPages };
