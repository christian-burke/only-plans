# Tab completion for onlyplans. `onlyplans setup --tabcomplete powershell` adds a line to your
# $PROFILE that dot-sources this file. Candidates come from `onlyplans __complete`.
Register-ArgumentCompleter -Native -CommandName onlyplans -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @($commandAst.CommandElements | Select-Object -Skip 1 |
    ForEach-Object { $_.ToString() })
  if ($wordToComplete -eq '') { $words += '' }
  onlyplans __complete @words 2>$null | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
