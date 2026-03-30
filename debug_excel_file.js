import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

async function test() {
    const leadsDir = './leads';
    const files = fs.readdirSync(leadsDir).filter(f => f.endsWith('.xlsx'));
    if (files.length === 0) {
        console.log('No xlsx files found');
        return;
    }

    const latestFile = files.sort().reverse()[0];
    const filePath = path.join(leadsDir, latestFile);
    console.log('Testing file:', filePath);

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        console.log('Successfully read workbook');
        console.log('Sheets:', workbook.worksheets.map(s => s.name));
        const sheet = workbook.getWorksheet('Leads');
        if (sheet) {
            console.log('Rows count:', sheet.rowCount);
        } else {
            console.log('Worksheet "Leads" not found');
        }
    } catch (err) {
        console.error('Failed to read workbook:', err.message);
    }
}

test();
