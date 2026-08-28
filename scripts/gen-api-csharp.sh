#!/usr/bin/env bash
# Regenerate the QueryFarm.Vgi C# API reference from public Roslyn syntax nodes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vgi_csharp="${VGI_CSHARP:-$HOME/Development/vgi-csharp}"

dotnet run --project "$repo_root/scripts/gen-api-csharp/QueryFarm.Vgi.ApiDocs.csproj" -- \
  "$vgi_csharp" "$repo_root/src/content/docs/vgi/docs/csharp/api"
