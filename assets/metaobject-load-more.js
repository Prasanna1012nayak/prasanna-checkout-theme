// /**
//  * Metaobject Load More
//  * Fetches all metaobject entries via the Storefront API (250 per page)
//  * and displays them after clicking "Load More".
//  */
// class MetaobjectLoadMore extends HTMLElement {
//   constructor() {
//     super();
//     this.button = this.querySelector('[data-load-more-btn]');
//     this.container = this.querySelector('[data-metaobject-entries]');
//     this.spinner = this.querySelector('[data-load-more-spinner]');
//     this.statusText = this.querySelector('[data-load-more-status]');

//     this.storefrontToken = this.dataset.storefrontToken;
//     this.metaobjectType = this.dataset.metaobjectType;
//     this.shopDomain = window.location.origin;
//     this.apiVersion = this.dataset.apiVersion || '2024-10';
//     this.displayFields = this.dataset.displayFields
//       ? this.dataset.displayFields.split(',').map(f => f.trim())
//       : [];
//     this.imageFields = this.dataset.imageFields
//       ? this.dataset.imageFields.split(',').map(f => f.trim())
//       : [];

//     if (this.button) {
//       this.button.addEventListener('click', this.loadAll.bind(this));
//     }
//   }

//   async loadAll() {
//     if (!this.storefrontToken || !this.metaobjectType) {
//       console.error('MetaobjectLoadMore: Missing storefrontToken or metaobjectType');
//       return;
//     }

//     this.button.disabled = true;
//     this.button.style.display = 'none';
//     if (this.spinner) this.spinner.style.display = 'block';
//     if (this.statusText) {
//       this.statusText.style.display = 'block';
//       this.statusText.textContent = 'Loading all entries...';
//     }

//     try {
//       const allEntries = await this.fetchAllMetaobjects();

//       // Clear existing Liquid-rendered entries
//       const existingCards = this.container.querySelectorAll('.metaobject-card');
//       existingCards.forEach(card => card.remove());

//       // Render all entries
//       allEntries.forEach(entry => {
//         const card = this.createCard(entry);
//         this.container.appendChild(card);
//       });

//       if (this.spinner) this.spinner.style.display = 'none';
//       if (this.statusText) {
//         this.statusText.textContent = `Showing all ${allEntries.length} entries`;
//       }
//     } catch (error) {
//       console.error('MetaobjectLoadMore: Error fetching entries', error);
//       this.button.disabled = false;
//       this.button.style.display = '';
//       if (this.spinner) this.spinner.style.display = 'none';
//       if (this.statusText) {
//         this.statusText.style.display = 'block';
//         this.statusText.textContent = 'Error loading entries. Please try again.';
//       }
//     }
//   }

//   async fetchAllMetaobjects() {
//     const allEntries = [];
//     let hasNextPage = true;
//     let cursor = null;

//     while (hasNextPage) {
//       const response = await this.fetchPage(cursor);
//       const data = response.data.metaobjects;

//       for (const edge of data.edges) {
//         allEntries.push(edge.node);
//       }

//       hasNextPage = data.pageInfo.hasNextPage;
//       cursor = data.pageInfo.endCursor;

//       if (this.statusText) {
//         this.statusText.textContent = `Loaded ${allEntries.length} entries...`;
//       }
//     }

//     return allEntries;
//   }

//   async fetchPage(cursor) {
//     const query = `
//       query MetaobjectList($type: String!, $first: Int!, $after: String) {
//         metaobjects(type: $type, first: $first, after: $after) {
//           edges {
//             node {
//               id
//               handle
//               type
//               fields {
//                 key
//                 value
//                 type
//                 reference {
//                   ... on MediaImage {
//                     image {
//                       url
//                       altText
//                       width
//                       height
//                     }
//                   }
//                 }
//               }
//             }
//           }
//           pageInfo {
//             hasNextPage
//             endCursor
//           }
//         }
//       }
//     `;

//     const variables = {
//       type: this.metaobjectType,
//       first: 250,
//     };

//     if (cursor) {
//       variables.after = cursor;
//     }

//     const response = await fetch(
//       `${this.shopDomain}/api/${this.apiVersion}/graphql.json`,
//       {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'X-Shopify-Storefront-Access-Token': this.storefrontToken,
//         },
//         body: JSON.stringify({ query, variables }),
//       }
//     );

//     if (!response.ok) {
//       throw new Error(`Storefront API error: ${response.status}`);
//     }

//     const json = await response.json();

//     if (json.errors) {
//       throw new Error(json.errors.map(e => e.message).join(', '));
//     }

//     return json;
//   }

//   createCard(entry) {
//     const card = document.createElement('div');
//     card.className = 'metaobject-card';

//     const fieldsToShow = this.displayFields.length > 0
//       ? entry.fields.filter(f => this.displayFields.includes(f.key))
//       : entry.fields;

//     let cardHTML = '';

//     for (const field of fieldsToShow) {
//       if (!field.value) continue;

//       // Check if this is an image field (file_reference with a reference)
//       if (
//         this.imageFields.includes(field.key) ||
//         (field.type === 'file_reference' && field.reference && field.reference.image)
//       ) {
//         const img = field.reference ? field.reference.image : null;
//         if (img) {
//           cardHTML += `
//             <div class="metaobject-card__field metaobject-card__field--image">
//               <img
//                 src="${img.url}"
//                 alt="${img.altText || field.key}"
//                 width="${img.width || ''}"
//                 height="${img.height || ''}"
//                 loading="lazy"
//               />
//             </div>`;
//         }
//         continue;
//       }

//       // Check if value looks like rich text JSON
//       let displayValue = field.value;
//       if (field.type === 'rich_text_field' || field.type === 'multi_line_text_field') {
//         try {
//           const parsed = JSON.parse(field.value);
//           if (parsed.type === 'root' && parsed.children) {
//             displayValue = this.renderRichText(parsed);
//           }
//         } catch (e) {
//           // Not JSON, use as plain text
//         }
//       }

//       // Check if it looks like a URL
//       if (field.type === 'url' || field.type === 'single_line_text_field' && displayValue.startsWith('http')) {
//         cardHTML += `
//           <div class="metaobject-card__field metaobject-card__field--${field.key}">
//             <a href="${this.escapeHtml(displayValue)}" target="_blank" rel="noopener">${this.escapeHtml(displayValue)}</a>
//           </div>`;
//         continue;
//       }

//       cardHTML += `
//         <div class="metaobject-card__field metaobject-card__field--${field.key}">
//           ${field.type === 'rich_text_field' ? displayValue : `<span>${this.escapeHtml(displayValue)}</span>`}
//         </div>`;
//     }

//     card.innerHTML = cardHTML;
//     return card;
//   }

//   renderRichText(node) {
//     if (!node) return '';

//     if (node.type === 'text') {
//       let text = this.escapeHtml(node.value || '');
//       if (node.bold) text = `<strong>${text}</strong>`;
//       if (node.italic) text = `<em>${text}</em>`;
//       return text;
//     }

//     const children = (node.children || []).map(c => this.renderRichText(c)).join('');

//     switch (node.type) {
//       case 'root': return children;
//       case 'paragraph': return `<p>${children}</p>`;
//       case 'heading': return `<h${node.level || 3}>${children}</h${node.level || 3}>`;
//       case 'list':
//         return node.listType === 'ordered'
//           ? `<ol>${children}</ol>`
//           : `<ul>${children}</ul>`;
//       case 'list-item': return `<li>${children}</li>`;
//       case 'link': return `<a href="${this.escapeHtml(node.url || '')}" target="_blank">${children}</a>`;
//       default: return children;
//     }
//   }

//   escapeHtml(str) {
//     const div = document.createElement('div');
//     div.textContent = str;
//     return div.innerHTML;
//   }
// }

// customElements.define('metaobject-load-more', MetaobjectLoadMore);
