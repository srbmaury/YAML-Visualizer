import { useEffect, useRef, useCallback } from 'react';

export function useYAMLWorker() {
  const workerRef = useRef(null);
  const callbacksRef = useRef({});
  const messageIdRef = useRef(0);

  useEffect(() => {
    // Create worker
    try {
      workerRef.current = new Worker(
        new URL('../workers/yamlWorker.js', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (e) => {
        const { type, data, error, messageId } = e.data;

        if (messageId && callbacksRef.current[messageId]) {
          const { resolve, reject } = callbacksRef.current[messageId];

          if (type === 'PARSE_SUCCESS' || type === 'ANALYSIS_COMPLETE') {
            resolve(data);
          } else if (type === 'PARSE_ERROR' || type === 'ERROR') {
            reject(new Error(error));
          }

          delete callbacksRef.current[messageId];
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
      };
    } catch (error) {
      console.warn('Web Worker not supported, falling back to main thread', error);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const parseYAML = useCallback((yamlText) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const messageId = ++messageIdRef.current;
      callbacksRef.current[messageId] = { resolve, reject };

      workerRef.current.postMessage({
        type: 'PARSE_YAML',
        payload: { yamlText },
        messageId
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (callbacksRef.current[messageId]) {
          reject(new Error('Worker timeout'));
          delete callbacksRef.current[messageId];
        }
      }, 30000);
    });
  }, []);

  const analyzeStructure = useCallback((parsedData) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const messageId = ++messageIdRef.current;
      callbacksRef.current[messageId] = { resolve, reject };

      workerRef.current.postMessage({
        type: 'ANALYZE_STRUCTURE',
        payload: { parsedData },
        messageId
      });

      setTimeout(() => {
        if (callbacksRef.current[messageId]) {
          reject(new Error('Worker timeout'));
          delete callbacksRef.current[messageId];
        }
      }, 10000);
    });
  }, []);

  return {
    parseYAML,
    analyzeStructure,
    isSupported: !!workerRef.current
  };
}
