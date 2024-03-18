<script setup>
import { ref, onMounted, markRaw } from "vue";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";

const baseURL = import.meta.env.BASE_URL;
pdfjs.GlobalWorkerOptions.workerSrc = `${baseURL}assets/pdfjs/pdf.worker.mjs`;

const puzzles = ref([]);
const currentPageNumber = ref(1);
const pdfDoc = ref(null);
const canvasRef = ref(null);

function initializeOpenCV() {
  console.log("OpenCV loaded and ready.");
}

async function renderPage(pageNum) {
  const page = await pdfDoc.value.getPage(pageNum);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = canvasRef.value;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };
  await page.render(renderContext).promise;

  puzzles.value = [];
  await processCanvasWidthOpenCV(canvas);
}

async function processCanvasWidthOpenCV(canvas) {
  if (!cv || !cv.imread) {
    console.error("OpenCV not loaded or not initialized properly.");
    return;
  }

  // Convert the canvas to a Mat object
  const original = cv.imread(canvas);
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // Apply Gaussian Blur
  const blurred = new cv.Mat();
  const ksize = new cv.Size(5, 5);
  cv.GaussianBlur(gray, blurred, ksize, 5, 5, cv.BORDER_DEFAULT);
  gray.delete();

  // Edge detection using Canny
  const edges = new cv.Mat();
  cv.Canny(blurred, edges, 50, 50);
  blurred.delete();

  // Create a kernel for dilation operation
  const kernelSize = new cv.Size(3, 3);
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, kernelSize);

  // Apply dilation
  const dilated = new cv.Mat();
  cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
  kernel.delete();
  edges.delete();

  // Create a kernel for erosion operation
  const kernelSizeE = new cv.Size(2, 2);
  const kernelE = cv.getStructuringElement(cv.MORPH_RECT, kernelSizeE);

  // Apply erosion on the dilated image (if you want to erode the original 'edges', use it instead of 'dilated')
  const eroded = new cv.Mat();
  cv.erode(dilated, eroded, kernelE, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
  kernelE.delete();
  dilated.delete();

  // Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(eroded, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
  eroded.delete();
  console.log("Contours found: ", contours.size());

  // Sort contours by area in descending order
  const sortedContours = sortContoursByArea(contours);
  contours.delete();

  // Filter and group contours here
  const filteredContoursRelArea = filterContoursByRelativeArea(sortedContours, src, 1, 40);
  console.log("Contours (Filter - Relative Area): ", filteredContoursRelArea.size());
  sortedContours.delete();
  // Filter contours by the most frequent area group (Adjust epsilonPercent as needed)
  const filteredContoursAreaFreq = filterContourAreaFrequency(filteredContoursRelArea, 1.0);
  console.log("Contours (Filter - Area Frequency): ", filteredContoursAreaFreq.size());
  filteredContoursRelArea.delete();

  // Process filtered contours further if needed, e.g., getting extreme points
  let pointsList = getContourPoints(filteredContoursAreaFreq);

  // Draw contours
  for (let i = 0; i < filteredContoursAreaFreq.size(); ++i) {
    let color = new cv.Scalar(0, 255, 0, 255);
    cv.drawContours(src, filteredContoursAreaFreq, i, color, 2, cv.LINE_8, hierarchy, 0);
  }

  plotPointsOnImage(src, pointsList, 5); // Adjust pointSize as needed

  // Display the result
  cv.imshow(canvas, src);

  const croppedImageURLs = await cropMatAndConvertToDataURL(original, pointsList);
  // Update puzzles array with cropped URLs and placeholder for FEN
  croppedImageURLs.forEach((url, index) => {
    const { topLeft, bottomRight } = pointsList[index];
    puzzles.value.push({
      url,
      fen: "", // Placeholder for FEN notation
      points: { topLeft, bottomRight },
    });
  });

  // Assuming you have a function to send the cropped images and update FEN (postFirstCroppedImage or similar)
  postCroppedImagesAndUpdateFEN(puzzles.value);

  // Clean up
  original.delete();
  src.delete();
  hierarchy.delete();
  filteredContoursAreaFreq.delete();
}

// Function to draw points on the canvas
function plotPointsOnImage(src, pointsList, pointSize = 5) {
  pointsList.forEach(({ topLeft, bottomRight }) => {
    // Convert points from JavaScript objects to OpenCV Points
    const topLeftPoint = new cv.Point(topLeft.x, topLeft.y);
    const bottomRightPoint = new cv.Point(bottomRight.x, bottomRight.y);

    // Define colors for the circles
    const blueColor = new cv.Scalar(255, 0, 0, 255); // Blue for top-left
    const redColor = new cv.Scalar(0, 0, 255, 255); // Red for bottom-right

    // Draw circles at the points
    cv.circle(src, topLeftPoint, pointSize, blueColor, -1); // -1 means filled circle
    cv.circle(src, bottomRightPoint, pointSize, redColor, -1); // -1 means filled circle
  });
}

// Function to post cropped images and update FEN notation in puzzles
async function postCroppedImagesAndUpdateFEN(puzzles) {
  for (let i = 0; i < puzzles.length; i++) {
    // Assuming puzzles[i].url is a dataURL. If not, you need to adjust this part.
    const imageBlob = dataURLToBlob(puzzles[i].url);
    const formData = new FormData();
    formData.append("image", imageBlob, `image${i}.png`);

    try {
      const response = await fetch("https://web-vrnocjtpaa-an.a.run.app/board_to_fen", {
        method: "POST",
        body: formData, // FormData object, no Content-Type header set manually
      });

      const data = await response.json();
      if (data.status === "success") {
        puzzles[i].fen = data.fen; // Update FEN notation
      } else {
        console.error("Error fetching FEN notation:", data);
      }
    } catch (error) {
      console.error("Failed to upload image or fetch FEN", error);
    }
  }
}

// Helper function to convert dataURL to Blob
function dataURLToBlob(dataURL) {
  const byteString = atob(dataURL.split(",")[1]);
  const mimeString = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

async function cropMatAndConvertToDataURL(originalMat, pointsList) {
  const croppedImageURLs = [];
  for (let { topLeft, bottomRight } of pointsList) {
    // Calculate the ROI (Region of Interest)
    const x = topLeft.x;
    const y = topLeft.y;
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    const rect = new cv.Rect(x, y, width, height);

    // Crop the image using the ROI
    const croppedMat = originalMat.roi(rect);

    // Convert the cropped Mat to a canvas then to a Data URL
    const croppedCanvas = document.createElement("canvas");
    cv.imshow(croppedCanvas, croppedMat);
    const dataURL = croppedCanvas.toDataURL();
    croppedImageURLs.push(dataURL);

    // Clean up the cropped Mat
    croppedMat.delete();
  }

  return croppedImageURLs;
}

// Assumes contours is a cv.MatVector obtained from cv.findContours
function sortContoursByArea(contours) {
  // Extract areas and indices
  let areasAndIndices = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    areasAndIndices.push({ area, index: i });
  }

  // Sort by area in descending order
  areasAndIndices.sort((a, b) => b.area - a.area);

  // You can now access the sorted contours using areasAndIndices array
  // For example, to create a new MatVector of contours sorted by area:
  let sortedContours = new cv.MatVector();
  areasAndIndices.forEach((item) => {
    sortedContours.push_back(contours.get(item.index));
  });

  return sortedContours;
}

// Function to filter contours by relative area with min and max area percent
function filterContoursByRelativeArea(contours, src, minAreaPercent = 1, maxAreaPercent = 100) {
  let filteredContours = new cv.MatVector();
  let imageArea = src.rows * src.cols;
  let minArea = (minAreaPercent / 100.0) * imageArea;
  let maxArea = (maxAreaPercent / 100.0) * imageArea;

  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    // Include contours within the specified area range
    if (area >= minArea && area <= maxArea) {
      filteredContours.push_back(cnt);
    }
  }

  return filteredContours;
}

// Calculates the group for a given area based on epsilon percent similarity
function calculateSimilarityGroup(area, groups, epsilonPercent) {
  for (let representativeArea of groups.keys()) {
    let meanArea = (representativeArea + area) / 2;
    if (Math.abs(representativeArea - area) <= meanArea * (epsilonPercent / 100)) {
      return representativeArea;
    }
  }
  return null;
}

// Groups contours by similar area
function groupContoursByArea(contours, epsilonPercent) {
  let groups = new Map();
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    let similarityGroup = calculateSimilarityGroup(area, groups, epsilonPercent);

    if (similarityGroup !== null) {
      if (groups.has(similarityGroup)) {
        groups.get(similarityGroup).push(cnt);
      } else {
        groups.set(similarityGroup, [cnt]);
      }
    } else {
      groups.set(area, [cnt]);
    }
  }
  return groups;
}

// Filters contours by the most frequent area group
function filterContourAreaFrequency(contours, epsilonPercent = 1.0) {
  let areaGroups = groupContoursByArea(contours, epsilonPercent);
  let mostFrequentGroup = null;
  let maxGroupSize = 0;

  for (let group of areaGroups.values()) {
    if (group.length > maxGroupSize) {
      mostFrequentGroup = group;
      maxGroupSize = group.length;
    }
  }

  let filteredContours = new cv.MatVector();
  if (mostFrequentGroup !== null) {
    mostFrequentGroup.forEach((contour) => filteredContours.push_back(contour));
  }

  return filteredContours;
}

function getContourPoints(contours) {
  let pointsList = [];

  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let rect = cv.minAreaRect(cnt);
    let vertices = cv.RotatedRect.points(rect);
    let points = vertices.map(v => ({ x: Math.round(v.x), y: Math.round(v.y) }));

    // Find top-left and bottom-right points
    let topLeft = points.reduce((acc, v) => ({ x: Math.min(acc.x, v.x), y: Math.min(acc.y, v.y) }), { x: Infinity, y: Infinity });
    let bottomRight = points.reduce((acc, v) => ({ x: Math.max(acc.x, v.x), y: Math.max(acc.y, v.y) }), { x: -Infinity, y: -Infinity });

    // Calculate contour height
    let contourHeight = bottomRight.y - topLeft.y;

    pointsList.push({ topLeft, bottomRight, contourHeight });
  }

  // Sort pointsList with dynamic epsilon based on contour height
  pointsList.sort((a, b) => {
    // Calculate dynamic epsilon as a percentage of each contour's height, e.g., 10%
    let epsilonA = 0.1 * a.contourHeight;
    let epsilonB = 0.1 * b.contourHeight;
    let averageEpsilon = (epsilonA + epsilonB) / 2;

    if (Math.abs(a.topLeft.y - b.topLeft.y) <= averageEpsilon) {
      // Sort by x positions in reverse order if considered on the same horizontal level
      return a.topLeft.x - b.topLeft.x;
    }
    // Otherwise, sort by y positions
    return a.topLeft.y - b.topLeft.y;
  });

  return pointsList.map(({ topLeft, bottomRight }) => ({ topLeft, bottomRight })); // Return without contourHeight for further processing
}

function onFileChange(event) {
  const file = event.target.files[0];
  if (file) {
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      const typedArray = new Uint8Array(e.target.result);
      // https://www.reddit.com/r/vuejs/comments/1825uea/want_to_understand_behavior_in_the_options_api/
      pdfDoc.value = markRaw(await pdfjs.getDocument({ data: typedArray }).promise);
      currentPageNumber.value = 1; // Reset to first page
      renderPage(currentPageNumber.value);
    };
    fileReader.readAsArrayBuffer(file);
  }
}

function incrementPage() {
  if (currentPageNumber.value < pdfDoc.value.numPages) {
    currentPageNumber.value++;
    renderPage(currentPageNumber.value);
  }
}

function decrementPage() {
  if (currentPageNumber.value > 1) {
    currentPageNumber.value--;
    renderPage(currentPageNumber.value);
  }
}

onMounted(async () => {
  cv["onRuntimeInitialized"] = () => initializeOpenCV();
});
</script>

<template>
  <div class="container">
    <div class="pdf-viewer">
      <input type="file" @change="onFileChange" accept="application/pdf" />
      <div>
        <canvas ref="canvasRef" willReadFrequently="true"></canvas>
      </div>
      <button @click="decrementPage">Previous</button>
      <button @click="incrementPage">Next</button>
    </div>
    <ul class="puzzles">
      <li tabindex="0" v-for="(puzzle, index) in puzzles" :key="index">
        <article>
          <h1>Puzzle {{ index + 1 }}</h1>
          <img :src="puzzle.url" alt="Cropped area" />
          <h2>FEN Notation</h2>
          <p>
            <ol class="fen-list">
              <li tabindex="0" v-for="(line, index) in puzzle.fen.split('/')">
                {{ line }}
              </li>
            </ol>
          </p>
        </article>
      </li>
    </ul>
  </div>
</template>

<style scoped>
container {
  position: relative;
}

.pdf-viewer {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px solid black;
  /* max-height: 70vh; */
  max-width: 70vw;
  margin: 0;
  margin-right: 30vw;
}

canvas {
  max-width: 100%;
}

ul {
  list-style-type: none;
  padding: unset;
}

ul.puzzles {
  position: absolute;
  top: 0;
  right: 0;
  overflow-y: scroll;
  max-height: 100%;
  width: calc(30vw - 2rem);
  margin: 0;
  padding-left: 2rem;
}

</style>
