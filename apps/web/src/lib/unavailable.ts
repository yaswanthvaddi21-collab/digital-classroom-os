/**
 * Stand-in for jsPDF's optional HTML-rendering dependencies (html2canvas, canvg, dompurify). The app only uses
 * jsPDF.addImage, so these are never called; aliasing them here keeps ~380 KB out of the build and offline cache.
 */
function unavailable(): never {
  throw new Error('This jsPDF feature is not included in Classroom OS');
}
export default unavailable;
export const sanitize = unavailable;
