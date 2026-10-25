import { useEffect, useState } from 'react';
import { artworkMimeType } from '@/lib/paper-minis/artwork-formats';
import type { PreparedArtwork } from '@/lib/paper-minis/types';

export function useArtworkUrl(artwork?: PreparedArtwork | null): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!artwork) {
      setUrl(undefined);

      return;
    }

    const next = URL.createObjectURL(
      new Blob([artwork.bytes.slice()], { type: artworkMimeType(artwork.format) }),
    );

    setUrl(next);

    return () => URL.revokeObjectURL(next);
  }, [artwork]);

  return url;
}
