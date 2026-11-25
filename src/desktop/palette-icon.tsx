// Use the artwork already mounted by Desktop rather than installing a second icon sprite.
export function Icon(props){
  return <svg aria-hidden="true" data-slot="icon-svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><use href={`#opencode-v2-icon-${props.name}`}/></svg>
}
