import fs from "fs";
import path from "path";

function removeComments(content) {
    // Remove single line comments // but preserve URLs like http://
    content = content.replace(/(?<!:)\/\/(?!\/).*$/gm, "");

    // Remove multi-line comments /* ... */
    content = content.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove empty lines that were left after comment removal
    content = content.replace(/^\s*\n/gm, "");

    // Remove multiple consecutive empty lines, leave only one
    content = content.replace(/\n\s*\n\s*\n/g, "\n\n");

    return content;
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const cleanContent = removeComments(content);

        if (content !== cleanContent) {
            fs.writeFileSync(filePath, cleanContent, "utf8");
            console.log(`Processed: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

function walkDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDirectory(filePath);
        } else if (file.endsWith(".js") || file.endsWith(".jsx")) {
            processFile(filePath);
        }
    }
}

// Start from src directory
walkDirectory("./src");
console.log("Comment removal complete!");
