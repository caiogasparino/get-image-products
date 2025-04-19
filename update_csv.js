import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { stringify } from 'csv-stringify/sync';

const csvFilePath = 'product.csv';
const imageBaseDir = 'imagens';
const githubBaseUrl = 'https://raw.githubusercontent.com/caiogasparino/get-image-products/refs/heads/main/imagens/';
const imageExtensions = ['.webp', '.jpg', '.jpeg', '.png', '.gif'];

const results = [];

fs.createReadStream(csvFilePath)
  .pipe(csvParser({ separator: ';', bom: true }))
  .on('data', (data) => {
    results.push(data);
  })
  .on('end', async () => {
    console.log(`Read ${results.length} records from ${csvFilePath}`);
    const updatedResults = [];
    let headers = null;

    for (const row of results) {
      if (!headers) {
        headers = Object.keys(row);
        if (!headers.includes('URL image')) {
          headers.push('URL image');
        }
      }

      // Try accessing the header without quotes, as csv-parser might trim them
      const identifier = row['Identificador URL'];
      const newRow = { ...row }; // Create a copy to modify
      console.log(`\nProcessing row with identifier: ${identifier}`);

      if (identifier) {
        const imageDir = path.join(imageBaseDir, identifier);
        console.log(`Checking directory path: ${imageDir}`);
        let imageUrls = [];

        try {
          if (fs.existsSync(imageDir) && fs.lstatSync(imageDir).isDirectory()) {
            console.log(`Directory found: ${imageDir}`);
            const files = fs.readdirSync(imageDir);
            console.log(`Files in directory: ${files.join(', ')}`);
            const imageFiles = files.filter(file => {
              const ext = path.extname(file).toLowerCase();
              return imageExtensions.includes(ext);
            });
            console.log(`Image files filtered: ${imageFiles.join(', ')}`);

            imageUrls = imageFiles.map(file => `${githubBaseUrl}${identifier}/${encodeURIComponent(file)}`);
            console.log(`Generated URLs: ${imageUrls.join(', ')}`);
          } else {
            console.warn(`Directory check failed: ${imageDir} (Exists: ${fs.existsSync(imageDir)}, IsDirectory: ${fs.existsSync(imageDir) ? fs.lstatSync(imageDir).isDirectory() : 'N/A'})`);
          }
        } catch (err) {
          console.error(`Error processing directory ${imageDir}:`, err);
        }
        // Ensure the key matches the header, including quotes if necessary for stringify
        newRow['URL image'] = imageUrls.join(',');
        console.log(`Assigned URLs to column: ${newRow['URL image']}`);
      } else {
        console.warn('Row missing or has empty "Identificador URL":', row);
        newRow['URL image'] = ''; // Add empty value if identifier is missing
      }
      updatedResults.push(newRow);
    }

    // Ensure headers are correctly ordered and include the new one
    const finalHeaders = headers ? headers.map(h => ({ key: h, header: h })) : [];
    // Find the original header key for the identifier - adjust based on parsing result
    const identifierHeaderKey = Object.keys(results[0] || {}).find(key => key.includes('Identificador URL')) || 'Identificador URL';


    // Prepare data for csv-stringify, ensuring keys match headers
    const dataToWrite = updatedResults.map(row => {
      const orderedRow = {};
      if (headers) {
        headers.forEach(header => {
          // Use the potentially unquoted key found earlier
          const keyToUse = header === 'Identificador URL' ? identifierHeaderKey : header;
          // Also handle the case where the original header *was* quoted for stringify columns
          const columnHeader = header === 'Identificador URL' ? '"Identificador URL"' : header;
          orderedRow[columnHeader] = row[keyToUse] !== undefined ? row[keyToUse] : '';
        });
      }
      return orderedRow;
    });


    try {
      // Use csv-stringify to write back, ensuring correct quoting and delimiter
      // Ensure the columns output includes the quotes for the identifier header if needed
      const columnsForStringify = finalHeaders.map(col => ({
        key: col.key === 'Identificador URL' ? '"Identificador URL"' : col.key, // Key for lookup in orderedRow
        header: col.header === 'Identificador URL' ? '"Identificador URL"' : col.header // Header text in output file
      }));

      const output = stringify(dataToWrite, {
        header: true,
        columns: columnsForStringify, // Use the potentially re-quoted headers
        delimiter: ';',
        quoted: true, // Quote fields only when necessary (e.g., contains delimiter, quote, or newline)
        quote: '"',
        escape: '"' // How to escape quotes within fields
      });

      fs.writeFileSync(csvFilePath, output);
      console.log(`Successfully updated ${csvFilePath} with image URLs.`);
    } catch (error) {
      console.error('Error writing CSV file:', error);
    }
  })
  .on('error', (error) => {
    console.error('Error reading CSV file:', error);
  });
