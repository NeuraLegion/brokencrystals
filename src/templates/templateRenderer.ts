// templateRenderer.ts - a custom template rendering implementation in TypeScript
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';  // Using EJS as a safer templating engine

// A more secure rendering function that properly escapes content
export function renderTemplate(templateName: string, data: Record<string, any>): string {
    const templatePath = path.resolve(__dirname, '../templates', `${templateName}.ejs`);

    // Load the template file
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // Render the template using EJS - known for proper escaping
    return ejs.render(templateContent, data, {
        escape: function(html) {
            return String(html)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    });
}

// Example usage
// const rendered = renderTemplate('example', { user: 'John Doe' });
// console.log(rendered);