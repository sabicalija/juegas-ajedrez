# ¿Juegas Ajedrez?

¿Juegas Ajedrez? is a Vue.js application designed for chess enthusiasts who love solving puzzles.

It leverages PDF.js for rendering chess puzzle PDFs and OpenCV.js for image processing to extract puzzles from the PDF pages. Each puzzle is then sent to a server that returns the FEN notation for the puzzle, enriching the user's experience by providing not only the visual representation of the puzzle but also its corresponding FEN notation for further analysis or play.

## Features

- **PDF Rendering**: Utilizes PDF.js for rendering PDF documents directly within the browser.
- **Puzzle Extraction**: Applies image processing techniques using OpenCV.js to identify and extract chess puzzles from each page of the PDF.
- **Server Integration**: Sends extracted puzzles to a server that returns the FEN notation for each puzzle.
- **Interactive UI**: Offers an intuitive interface for users to navigate through the PDF, view extracted puzzles, and their FEN notations.

## Installation and Usage

1. **Prerequisites**:
   - Ensure you have [Node.js](https://nodejs.org/) installed on your system.
   - Clone the repository or download the source code.

2. **Installation**:
   - Navigate to the project directory and run `npm install` to install the required dependencies.

3. **Running the Application**:
   - Start the development server using `npm run dev`.
   - Open [http://localhost:5173](http://localhost:5173) in your browser to view the application.

4. **Building for Production**:
   - Run `npm run build` to build the application for production. The build artifacts will be stored in the `dist/` directory.
   - Use `npm run preview` to preview the production build locally.

## Configuration

The application is configured to load PDF.js worker and OpenCV.js from specific paths. Ensure that these paths are correctly set up in `App.vue` based on your deployment:

```javascript
const baseURL = import.meta.env.BASE_URL;
pdfjs.GlobalWorkerOptions.workerSrc = `${baseURL}assets/pdfjs/pdf.worker.mjs`;
```

Adjust the baseURL in your vite.config.js if you are deploying the application in a subdirectory.

## Deploying to GitHub Pages

The application is prepared for deployment on GitHub Pages. Ensure the base option in vite.config.js is set according to your GitHub Pages configuration:

```javascript
export default defineConfig({
  base: '/<repository-name>/',
  // other configurations...
});
```

Run npm run build to generate the production build, then deploy the dist/ directory to GitHub Pages.

## Contributing

Contributions are welcome! Feel free to submit pull requests with improvements, bug fixes, or new features.

## License

This project is licensed under the GNU General Public License Version 3, 29 June 2007 - see the [LICENSE](LICENSE) file for details.


Enjoy exploring and solving chess puzzles with ¿Juegas Ajedrez?!