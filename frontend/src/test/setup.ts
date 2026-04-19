import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView; mock it globally so components
// that call element.scrollIntoView() do not throw during tests.
window.HTMLElement.prototype.scrollIntoView = () => {}
