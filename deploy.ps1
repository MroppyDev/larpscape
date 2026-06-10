# Deploy Larpscape to the VPS.
# Usage:
#   .\deploy.ps1                 # deploy with default 15s in-game warning
#   .\deploy.ps1 -WarnSeconds 60 # give players a longer heads-up
#   .\deploy.ps1 -Message "Big update incoming!"
param(
    [int]$WarnSeconds = 15,
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$VpsHost = "root@150.40.117.235"

# Ensure the 'vps' remote exists (bare repo on the server)
$remotes = git remote
if ($remotes -notcontains "vps") {
    git remote add vps "${VpsHost}:/srv/git/larpscape.git"
    Write-Host "Added git remote 'vps'."
}

$branch = git symbolic-ref --short HEAD
Write-Host "==> Pushing branch '$branch' to VPS..."
git push vps $branch

Write-Host "==> Running remote deploy (players get a ${WarnSeconds}s in-game warning)..."
$envPrefix = "WARN_SECONDS=$WarnSeconds"
if ($Message -ne "") {
    $safeMsg = $Message -replace '"', ''
    $envPrefix += " MESSAGE=`"$safeMsg`""
}
ssh $VpsHost "$envPrefix bash /opt/larpscape/deploy/update.sh"

Write-Host "==> Deploy finished."
