# Tab completion for onlyplans. `onlyplans setup --tabcomplete bash` adds a line to your profile
# that sources this file. Candidates come from `onlyplans __complete`.
_onlyplans() {
  local -a words
  words=("${COMP_WORDS[@]:1}")
  local IFS=$'\n'
  COMPREPLY=($(onlyplans __complete "${words[@]}" 2>/dev/null))
}
complete -F _onlyplans onlyplans
