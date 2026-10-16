# Tab completion for onlyplans. `onlyplans setup --tabcomplete powershell` adds a line to your
# $PROFILE that dot-sources this file. Candidates come from `onlyplans __complete`.
# npm installs `onlyplans` as a .cmd shim, and PowerShell drops empty arguments to .cmd files,
# so the completer runs the script through node and passes the empty word under the cursor.
$onlyplansScript = [IO.Path]::Combine($PSScriptRoot, '..', 'bin', 'onlyplans.js')
Register-ArgumentCompleter -Native -CommandName onlyplans -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @($commandAst.CommandElements | Select-Object -Skip 1 |
    ForEach-Object { $_.ToString() })
  if ($wordToComplete -eq '') { $words += '' }
  & node $onlyplansScript __complete @words 2>$null | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}.GetNewClosure()
Remove-Variable onlyplansScript
