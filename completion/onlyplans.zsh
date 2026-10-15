# Tab completion for onlyplans. `onlyplans setup --tabcomplete zsh` adds a line to your profile
# that sources this file. Candidates and hints come from `onlyplans __complete`.
_onlyplans() {
  local -a candidates
  candidates=(${(f)"$(onlyplans __complete "${words[@]:1}" 2>/dev/null)"})
  if (( ${#candidates} )); then
    compadd -- "${candidates[@]}"
  else
    local hint
    hint=$(onlyplans __complete "${words[@]:1}" 2>&1 >/dev/null)
    [[ -n $hint ]] && _message -r "$hint"
  fi
}
(( $+functions[compdef] )) || { autoload -Uz compinit && compinit; }
compdef _onlyplans onlyplans
