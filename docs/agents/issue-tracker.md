# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues under
`Seigiard/ttrpg-tools`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments with `jq` and fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with suitable `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Run commands inside this checkout so `gh` resolves `Seigiard/ttrpg-tools` from the
configured remote.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests do not enter the issue triage
queue unless this flag is changed deliberately.

GitHub shares one number space across issues and pull requests. For a bare `#42`, try
`gh pr view 42` and fall back to `gh issue view 42`.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When it asks
for the relevant ticket, run `gh issue view <number> --comments`.

## Wayfinding operations

`/wayfinder` stores a map as one issue labelled `wayfinder:map`, with decision tickets
as child issues. Use GitHub sub-issues and native issue dependencies when available.
Where those features are unavailable, keep children in a task list on the map, put
`Part of #<map>` in each child, and record blockers as `Blocked by: #<number>`.
Label each child for its ticket type: `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, or `wayfinder:task`.

Claim a ticket with `gh issue edit <number> --add-assignee @me`. Resolve it by posting
the answer, closing the issue, and adding its context pointer to the map's decisions.
