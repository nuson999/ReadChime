// Synthetic fixtures reproduce the supported outer structure without private account HTML.
export const readerFixture = '<reader-control></reader-control><iframe class="-gb-display"></iframe>';
export const libraryFixture = `<gpb-library-home><a class="navbar-item your-books selected"></a><gpb-shelf-page>
  <div class="page-controls"><button class="pagination-button" disabled>Previous</button><button class="pagination-button">Next</button><button class="pagination-button pagination-toggle-button">Show all</button></div>
  <div class="-gb-book-card-grid">${Array.from({ length: 100 }, (_, index) => {
    const url = `https://play.google.com/books/reader?id=fixture-${index}`;
    return `<div class="card ebook"><a class="card-link" href="${url}"></a><a class="cover-link" href="${url}"></a><div class="metadata"><a class="title" href="${url}">Synthetic book ${index}</a><a class="author">${index ? `Author ${index}` : ''}</a></div></div>`;
  }).join('')}</div></gpb-shelf-page></gpb-library-home>`;
