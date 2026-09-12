# Grimoire Press Context

Vocabulary for the rulebook editor: a browser tool where an author writes a tabletop
RPG rulebook on the left and sees the paginated result on the right.

## Book

The whole work an author is editing: one rulebook, from first sheet to last. A book
declares its sheet size and its theme. It is the root of a document.

## Draft

The browser-local, automatically saved editable copy of one book. A draft changes as the
author edits and is distinct from a saved file the author chooses to keep.

## Saved file

The portable copy an author downloads or opens. A saved file carries a book together
with its theme.

## Editor session

One open instance of the editor, from opening it until it is closed. A session edits one
draft at a time and may restore an existing draft or create a replacement draft by
opening a saved file.

## Section

A run of book content that shares one layout, above all a column count. The author
declares a section; the engine decides how many sheets its content occupies.

A section is the unit that answers "how is this part of the book laid out", never "where
does this sheet end".

## Sheet

One numbered output surface produced by pagination; in print, one side of a physical leaf.
A section may flow across any number of sheets; an author-declared page occupies exactly
one.

Avoid: physical page.

## Page

An author-declared element that must occupy exactly one sheet rather than being filled by
the engine. Used where the arrangement itself is the content: a character sheet, a
reference card, a table meant to sit alone on its own sheet.

A page is the exception. Text in a book flows through sections; a page opts out of that
flow. It sits beside a section rather than inside one, because a section is the flow a
page opts out of.

"Exactly one" is a claim the editor checks, not a hope. A span of section content between
two page breaks may occupy one sheet today and silently occupy two tomorrow when the
author adds a line. A page that no longer fits on one sheet is reported to the author.

A page may be turned landscape. It may not be a different size from the book: a book is
bound at one format, and a rotated sheet is still that format while a larger one is a
book nobody can bind.

A page carries no running header. The header names where the reader is in the flow, and
a page has left the flow, so on a page it would name somewhere the reader is not. Its
printed number stays, because it is an address and the address is still true.

## Page break

A point where the author forces the current sheet to end, even though content would
otherwise continue on it. Belongs inside a section.

## Column break

A point where the author forces the current column to end and the next one to begin.
Meaningful only inside a section with more than one column.

## Theme

The complete visual identity of a book: typefaces, sizes, spacing, rules, colours. A
theme also determines which scripts the book can be set in, because a theme's typefaces
either cover an alphabet or do not. A theme that covers only the Latin alphabet cannot
set a Russian book.

A book names one theme.

A theme does not choose or override sheet size. Sheet size belongs to the book.

## Component

A named block an author uses instead of describing its arrangement each time: a move, a
stat block, a field to write in. Components are defined inside the book itself, so a book
opens complete on any machine.

## Component set

A group of components belonging to one family of games, such as Powered by the Apocalypse
or Old School Renaissance. The editor keeps ready-made sets and inserts one into a book
as a starting point; from that moment the definitions belong to the book and the author
may change them.

## Preview

The paginated rendering of the book shown on the right-hand side of the editor. A current
preview and the PDF are produced from the same marked-up book, so the current preview
shows what will be printed.

## Stale Preview

The last successfully generated preview retained after a preview refresh fails. It
remains visible but no longer represents the draft's current contents.

## Preview refresh

An attempt to paginate the book in the current draft. On success it replaces the preview;
on failure any existing preview remains visible as a stale preview, while a first refresh
has nothing to retain. "Refresh" is the author-facing term; avoid "repaint" for this
operation.
