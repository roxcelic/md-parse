const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const markdownItAttrs = require('markdown-it-attrs');
const markdownItContainer = require('markdown-it-container');
const markdownItFootnote = require('markdown-it-footnote');
const puppeteer = require('puppeteer');
const chokidar = require('chokidar');
const debounce = require('lodash.debounce');

const md = markdownIt()
    .use(markdownItAttrs)
    .use(markdownItContainer, 'warning')
    .use(markdownItFootnote);

const inputDir = path.join(__dirname, 'md');
const outputPdfDir = path.join(__dirname, 'pdf');
const outputHtmlDir = path.join(__dirname, 'html');
const cssUrl = 'https://style.roxcelic.love/styles.css';
const localCssPath = path.join(__dirname, 'style.css');

function getMarkdownFiles(dir) {
    const files = [];
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            files.push(...getMarkdownFiles(fullPath));
        } else if (path.extname(file).toLowerCase() === '.md') {
            files.push(fullPath);
        }
    });
    return files;
}

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

async function convertMarkdownToPDF(markdownFile, css) {
    const markdown = fs.readFileSync(markdownFile, 'utf8');
    const htmlContent = md.render(markdown);

    const relativePath = path.relative(inputDir, markdownFile);
    const outputFilePath = path.join(outputPdfDir, relativePath.replace(/\.md$/, '.pdf'));

    ensureDirectoryExistence(outputFilePath);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Pixelify+Sans&display=swap');
            body {
                font-family: 'Pixelify Sans', sans-serif;
            }
            ${css}
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;

    console.log('Launching Puppeteer in headless mode...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--window-position=-1000,-1000',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
        ]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.pdf({
        path: outputFilePath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true
    });
    await browser.close();
    console.log('PDF conversion completed for:', markdownFile);
}

function convertMarkdownToHTML(markdownFile, css) {
    const markdown = fs.readFileSync(markdownFile, 'utf8');
    const htmlContent = md.render(markdown);

    const relativePath = path.relative(inputDir, markdownFile);
    const outputFilePath = path.join(outputHtmlDir, relativePath.replace(/\.md$/, '.html'));

    ensureDirectoryExistence(outputFilePath);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Pixelify+Sans&display=swap');
            body {
                font-family: 'Pixelify Sans', sans-serif;
            }
            ${css}
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;

    fs.writeFileSync(outputFilePath, html);
    console.log('HTML conversion completed for:', markdownFile);
}

(async () => {
    const response = await fetch(cssUrl);
    if (!response.ok) {
        throw new Error(`Failed to download CSS from ${cssUrl}`);
    }
    const remoteCss = await response.text();
    const localCss = fs.existsSync(localCssPath) ? fs.readFileSync(localCssPath, 'utf8') : '';
    const combinedCss = `${remoteCss}\n${localCss}`;
    const markdownFiles = getMarkdownFiles(inputDir);

    for (const markdownFile of markdownFiles) {
        await convertMarkdownToPDF(markdownFile, combinedCss);
        convertMarkdownToHTML(markdownFile, combinedCss);
    }

    const debouncedConvert = debounce(async (filePath) => {
        if (path.extname(filePath).toLowerCase() === '.md') {
            await convertMarkdownToPDF(filePath, combinedCss);
            convertMarkdownToHTML(filePath, combinedCss);
        }
    }, 500);

    chokidar.watch(inputDir, { ignored: /(^|[\/\\])\../ }).on('change', debouncedConvert);
})();
