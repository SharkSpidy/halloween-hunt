import { OPENCV_URL } from '../config';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CV = any; // opencv.js ships no usable typings

let cvPromise: Promise<CV> | null = null;

/** Lazily loads opencv.js once (script tag from CDN or your own /vendor copy). */
export function loadOpenCV(): Promise<CV> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise<CV>((resolve, reject) => {
    const w = window as any;

    const ready = async () => {
      try {
        let cv = w.cv;
        // Newer builds expose cv as a thenable that resolves to the module.
        if (cv && typeof cv.then === 'function') {
          cv = await cv;
          w.cv = cv;
        }
        if (cv && cv.Mat) {
          resolve(cv);
        } else if (cv) {
          cv.onRuntimeInitialized = () => resolve(w.cv);
        } else {
          reject(new Error('OpenCV loaded but global `cv` is missing'));
        }
      } catch (e) {
        reject(e);
      }
    };

    if (w.cv) {
      void ready();
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => void ready();
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  }).catch((e) => {
    cvPromise = null; // allow retry
    throw e;
  });

  return cvPromise;
}
