import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';

export interface AnnotationReply {
  id: string;
  author: string;
  color: string;
  content: string;
  createdAt: number;
}

export interface Annotation {
  id: string;
  author: string;
  color: string;
  content: string;
  anchorText: string;
  resolved: boolean;
  createdAt: number;
  replies: AnnotationReply[];
}

export function useAnnotations(doc: Y.Doc | null) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const annotationsMap = doc ? doc.getMap<Y.Map<unknown>>('annotations') : null;

  // Sync Yjs map to React state
  const syncFromYjs = useCallback(() => {
    if (!annotationsMap) return;

    const result: Annotation[] = [];
    annotationsMap.forEach((yAnnotation, key) => {
      const repliesArray = yAnnotation.get('replies') as Y.Array<Y.Map<unknown>> | undefined;
      const replies: AnnotationReply[] = [];

      if (repliesArray) {
        repliesArray.forEach((yReply) => {
          replies.push({
            id: yReply.get('id') as string,
            author: yReply.get('author') as string,
            color: yReply.get('color') as string,
            content: yReply.get('content') as string,
            createdAt: yReply.get('createdAt') as number,
          });
        });
      }

      result.push({
        id: key,
        author: yAnnotation.get('author') as string,
        color: yAnnotation.get('color') as string,
        content: yAnnotation.get('content') as string,
        anchorText: yAnnotation.get('anchorText') as string,
        resolved: (yAnnotation.get('resolved') as boolean) ?? false,
        createdAt: yAnnotation.get('createdAt') as number,
        replies,
      });
    });

    result.sort((a, b) => a.createdAt - b.createdAt);
    setAnnotations(result);
  }, [annotationsMap]);

  useEffect(() => {
    if (!annotationsMap) return;

    syncFromYjs();

    const observer = () => syncFromYjs();
    annotationsMap.observeDeep(observer);

    return () => {
      annotationsMap.unobserveDeep(observer);
    };
  }, [annotationsMap, syncFromYjs]);

  const addAnnotation = useCallback(
    (annotation: Omit<Annotation, 'replies' | 'resolved' | 'createdAt'>) => {
      if (!annotationsMap || !doc) return;

      doc.transact(() => {
        const yAnnotation = new Y.Map<unknown>();
        yAnnotation.set('author', annotation.author);
        yAnnotation.set('color', annotation.color);
        yAnnotation.set('content', annotation.content);
        yAnnotation.set('anchorText', annotation.anchorText);
        yAnnotation.set('resolved', false);
        yAnnotation.set('createdAt', Date.now());
        yAnnotation.set('replies', new Y.Array());
        annotationsMap.set(annotation.id, yAnnotation);
      });
    },
    [annotationsMap, doc],
  );

  const addReply = useCallback(
    (annotationId: string, reply: Omit<AnnotationReply, 'createdAt'>) => {
      if (!annotationsMap || !doc) return;

      const yAnnotation = annotationsMap.get(annotationId);
      if (!yAnnotation) return;

      doc.transact(() => {
        const repliesArray = yAnnotation.get('replies') as Y.Array<Y.Map<unknown>>;
        const yReply = new Y.Map<unknown>();
        yReply.set('id', reply.id);
        yReply.set('author', reply.author);
        yReply.set('color', reply.color);
        yReply.set('content', reply.content);
        yReply.set('createdAt', Date.now());
        repliesArray.push([yReply]);
      });
    },
    [annotationsMap, doc],
  );

  const toggleResolved = useCallback(
    (annotationId: string) => {
      if (!annotationsMap) return;

      const yAnnotation = annotationsMap.get(annotationId);
      if (!yAnnotation) return;

      const current = yAnnotation.get('resolved') as boolean;
      yAnnotation.set('resolved', !current);
    },
    [annotationsMap],
  );

  const editAnnotation = useCallback(
    (annotationId: string, newContent: string) => {
      if (!annotationsMap) return;

      const yAnnotation = annotationsMap.get(annotationId);
      if (!yAnnotation) return;

      yAnnotation.set('content', newContent);
    },
    [annotationsMap],
  );

  const editReply = useCallback(
    (annotationId: string, replyId: string, newContent: string) => {
      if (!annotationsMap) return;

      const yAnnotation = annotationsMap.get(annotationId);
      if (!yAnnotation) return;

      const repliesArray = yAnnotation.get('replies') as Y.Array<Y.Map<unknown>> | undefined;
      if (!repliesArray) return;

      for (let i = 0; i < repliesArray.length; i++) {
        const yReply = repliesArray.get(i);
        if (yReply.get('id') === replyId) {
          yReply.set('content', newContent);
          break;
        }
      }
    },
    [annotationsMap],
  );

  const deleteAnnotation = useCallback(
    (annotationId: string) => {
      if (!annotationsMap) return;
      annotationsMap.delete(annotationId);
    },
    [annotationsMap],
  );

  return {
    annotations,
    addAnnotation,
    addReply,
    editAnnotation,
    editReply,
    toggleResolved,
    deleteAnnotation,
  };
}
