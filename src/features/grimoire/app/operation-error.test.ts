import { describe, expect, test } from 'bun:test';

import { EngineTimeoutError } from '../adapters/engine-timeout';
import { UnreadableBookFileError } from '../adapters/file';
import { MarkupError, UnknownTagError } from '../core/markup-error';
import {
  describeBookPrintError,
  describePreviewRefreshError,
  describeSavedFileLoadError,
  toBookMarkupError,
  toBookPrintError,
  toPreviewRefreshError,
  toSavedFileLoadError,
  type BookMarkupError,
  type BookPrintError,
  type PreviewRefreshError,
  type SavedFileLoadError,
} from './operation-error';

type ErrorCases<Error extends { readonly kind: string }> = {
  readonly [Kind in Error['kind']]: readonly [Extract<Error, { readonly kind: Kind }>, string];
};

const bookMarkupCases = {
  'markup-error': [
    { kind: 'markup-error', message: 'invalid attribute', line: 4 },
    'line 4: invalid attribute',
  ],
  'unknown-tag': [
    { kind: 'unknown-tag', tag: 'PageBrek', line: 7 },
    'line 7: <PageBrek> is not a tag this editor recognizes',
  ],
} satisfies ErrorCases<BookMarkupError>;

describe('Grimoire operation errors', () => {
  test('classifies Book markup errors and rethrows unexpected core failures', () => {
    expect(toBookMarkupError(new MarkupError('invalid attribute', 4))).toEqual({
      kind: 'markup-error',
      message: 'invalid attribute',
      line: 4,
    });
    expect(toBookMarkupError(new UnknownTagError('PageBrek', 7))).toEqual({
      kind: 'unknown-tag',
      tag: 'PageBrek',
      line: 7,
    });

    const unexpected = new Error('renderer defect');
    expect(() => toBookMarkupError(unexpected)).toThrow(unexpected);
  });

  test('classifies and exhaustively describes Preview refresh errors', () => {
    expect(toPreviewRefreshError(new EngineTimeoutError(30))).toEqual({
      kind: 'preview-timeout',
      seconds: 30,
    });
    expect(toPreviewRefreshError(new Error('viewer rejected the document'))).toEqual({
      kind: 'preview-engine-failure',
      message: 'viewer rejected the document',
    });

    const cases = {
      ...bookMarkupCases,
      'preview-engine-failure': [
        { kind: 'preview-engine-failure', message: 'viewer rejected the document' },
        'the pagination engine could not lay out the book: viewer rejected the document',
      ],
      'preview-timeout': [
        { kind: 'preview-timeout', seconds: 30 },
        'the pagination engine did not answer within 30 seconds; reload the editor to try again',
      ],
    } satisfies ErrorCases<PreviewRefreshError>;

    for (const [error, description] of Object.values(cases)) {
      expect(describePreviewRefreshError(error)).toBe(description);
    }
  });

  test('classifies and exhaustively describes Book print errors', () => {
    expect(toBookPrintError(new EngineTimeoutError(60))).toEqual({
      kind: 'print-timeout',
      seconds: 60,
    });
    expect(toBookPrintError(new Error('Vivliostyle could not print'))).toEqual({
      kind: 'print-engine-failure',
      message: 'Vivliostyle could not print',
    });

    const cases = {
      ...bookMarkupCases,
      'print-engine-failure': [
        { kind: 'print-engine-failure', message: 'Vivliostyle could not print' },
        'Vivliostyle could not print',
      ],
      'print-timeout': [
        { kind: 'print-timeout', seconds: 60 },
        'the print engine did not answer within 60 seconds; reload the editor and print again',
      ],
    } satisfies ErrorCases<BookPrintError>;

    for (const [error, description] of Object.values(cases)) {
      expect(describeBookPrintError(error)).toBe(description);
    }
  });

  test('classifies and exhaustively describes saved file load errors', () => {
    expect(
      toSavedFileLoadError(
        new UnreadableBookFileError('"notes.txt" is not a Grimoire Press book file'),
      ),
    ).toEqual({
      kind: 'unreadable-file',
      message: '"notes.txt" is not a Grimoire Press book file',
    });
    expect(toSavedFileLoadError(new Error('permission denied'))).toEqual({
      kind: 'load-failure',
      message: 'permission denied',
    });

    const cases = {
      'unreadable-file': [
        { kind: 'unreadable-file', message: '"notes.txt" is not a Grimoire Press book file' },
        '"notes.txt" is not a Grimoire Press book file',
      ],
      'load-failure': [{ kind: 'load-failure', message: 'permission denied' }, 'permission denied'],
    } satisfies ErrorCases<SavedFileLoadError>;

    for (const [error, description] of Object.values(cases)) {
      expect(describeSavedFileLoadError(error)).toBe(description);
    }
  });
});
