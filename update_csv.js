import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { stringify } from 'csv-stringify/sync';

const csvFilePath = 'product.csv';
const imageBaseDir = 'imagens';
const supabaseUrl = 'https://stpdyvhrwpnfrypzqktw.supabase.co/storage/v1/object/public/images/';
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

      const identifier = row['"Identificador URL"'];
      const newRow = { ...row };
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

            imageUrls = imageFiles.map(file => `${supabaseUrl}${identifier}/${encodeURIComponent(file)}`);
            console.log(`Generated URLs: ${imageUrls.join(', ')}`);
          } else {
            console.warn(`Directory check failed: ${imageDir} (Exists: ${fs.existsSync(imageDir)}, IsDirectory: ${fs.existsSync(imageDir) ? fs.lstatSync(imageDir).isDirectory() : 'N/A'})`);
          }
        } catch (err) {
          console.error(`Error processing directory ${imageDir}:`, err);
        }
        newRow['URL image'] = imageUrls.join(',');
        console.log(`Assigned URLs to column: ${newRow['URL image']}`);
      } else {
        console.warn('Row missing or has empty "Identificador URL":', row);
        newRow['URL image'] = '';
      }
      updatedResults.push(newRow);
    }

    const finalHeaders = headers ? headers.map(h => ({ key: h, header: h })) : [];
    const identifierHeaderKey = Object.keys(results[0] || {}).find(key => key.includes('Identificador URL')) || '"Identificador URL"';

    const dataToWrite = updatedResults.map(row => {
      const orderedRow = {};
      if (headers) {
        headers.forEach(header => {
          const keyToUse = header === '"Identificador URL"' ? identifierHeaderKey : header;
          orderedRow[header] = row[keyToUse] !== undefined ? row[keyToUse] : '';
        });
      }
      return orderedRow;
    });


    try {
      const output = stringify(dataToWrite, {
        header: true,
        columns: finalHeaders,
        delimiter: ';',
        quoted: true,
        quote: '"',
        escape: '"'
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
