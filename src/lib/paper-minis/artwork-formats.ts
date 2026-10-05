export const ARTWORK_MIME_TYPES = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  webp: ['image/webp'],
} as const;

export type ArtworkFormat = keyof typeof ARTWORK_MIME_TYPES;

export type PreparedArtworkFormat = Exclude<ArtworkFormat, 'webp'>;

export const ARTWORK_ACCEPT = Object.values(ARTWORK_MIME_TYPES).flat().join(',');

export function artworkFormatForMimeType(type: string): ArtworkFormat | undefined {
  const normalized = type.toLowerCase();

  // SAFETY: This local literal has only the keys in ArtworkFormat.
  return (Object.keys(ARTWORK_MIME_TYPES) as ArtworkFormat[]).find((format) =>
    ARTWORK_MIME_TYPES[format].some((mimeType) => mimeType === normalized),
  );
}

export function artworkMimeType(format: ArtworkFormat): string {
  return ARTWORK_MIME_TYPES[format][0];
}
