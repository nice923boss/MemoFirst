import { Mark, mergeAttributes } from '@tiptap/core';

export interface AnnotationMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationMark: {
      setAnnotation: (annotationId: string, color: string) => ReturnType;
      unsetAnnotation: () => ReturnType;
    };
  }
}

export const AnnotationMark = Mark.create<AnnotationMarkOptions>({
  name: 'annotation',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      annotationId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-annotation-id'),
        renderHTML: (attributes) => {
          if (!attributes.annotationId) return {};
          return { 'data-annotation-id': attributes.annotationId };
        },
      },
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-annotation-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) return {};
          return {
            'data-annotation-color': attributes.color,
            style: `background-color: ${attributes.color}33; border-bottom: 2px solid ${attributes.color};`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-annotation-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'annotation-highlight cursor-pointer',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAnnotation:
        (annotationId: string, color: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { annotationId, color });
        },
      unsetAnnotation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
