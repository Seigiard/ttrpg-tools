# The editor carries no UI framework or state library

CodeMirror and Vivliostyle are framework-independent and own their own state. The source
belongs to CodeMirror; parsed markup and preview HTML are derived. Plain TypeScript DOM
code wires the editor, persistence, pagination, printing, and file controls together.

Refresh scheduling adds only a debounce timer, an in-flight flag, and one coalesced
pending source. This is local scheduling state, not application model state. A framework
or store should be reconsidered only if the interface grows substantially.
