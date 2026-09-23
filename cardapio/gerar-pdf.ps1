# Gera o PDF do cardapio de eventos a partir de cardapio.html.
# Usa o Microsoft Edge em modo headless (ja vem no Windows) - nao precisa de Python.
# Uso: clique com o botao direito > "Executar com PowerShell", ou:
#   powershell -ExecutionPolicy Bypass -File gerar-pdf.ps1

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $aqui 'cardapio.html'
$pdf  = Join-Path $aqui 'Brew_Cardapio_Eventos.pdf'

$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
if (-not (Test-Path $edge)) { throw 'Microsoft Edge nao encontrado.' }

# perfil separado: nao interfere num Edge que ja esteja aberto
$perfil = Join-Path $env:TEMP 'brew-cardapio-pdf'
$url = ([Uri]$html).AbsoluteUri
if (Test-Path $pdf) { Remove-Item $pdf -Force }

$args = @(
  '--headless=new', '--disable-gpu', '--no-first-run',
  "--user-data-dir=$perfil",
  '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=8000',
  "--print-to-pdf=$pdf",
  $url
)
Start-Process -FilePath $edge -ArgumentList $args -Wait -WindowStyle Hidden

if (-not (Test-Path $pdf)) { throw 'O Edge nao gerou o PDF.' }
Write-Host ('PDF gerado: ' + $pdf + ' (' + [math]::Round((Get-Item $pdf).Length / 1MB, 1) + ' MB)')
