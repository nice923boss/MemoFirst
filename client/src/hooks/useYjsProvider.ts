import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface UseYjsProviderOptions {
  docId: string;
  nickname: string;
  color: string;
}

interface UseYjsProviderReturn {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  connected: boolean;
}

export function useYjsProvider({
  docId,
  nickname,
  color,
}: UseYjsProviderOptions): UseYjsProviderReturn {
  const [connected, setConnected] = useState(false);
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!docId) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    // Build WebSocket URL based on current page location
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    const provider = new WebsocketProvider(wsUrl, docId, doc);
    providerRef.current = provider;

    // Set awareness (cursor name + color)
    provider.awareness.setLocalStateField('user', {
      name: nickname,
      color: color,
    });

    provider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    return () => {
      provider.awareness.setLocalState(null);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      docRef.current = null;
      providerRef.current = null;
      setConnected(false);
    };
  }, [docId, nickname, color]);

  return {
    doc: docRef.current,
    provider: providerRef.current,
    connected,
  };
}
