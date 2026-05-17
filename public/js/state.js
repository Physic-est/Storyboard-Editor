/** プロジェクト全データの単一ソース */

const ELEM_COLORS = ['#7b68f0','#38d9a9','#f56565','#f5a623','#56d6f5','#f594a0','#a06af0','#6ab0f5','#f5d66a'];

const DEFAULTS = () => ({
  settings: { width: 1920, height: 1080, unit: 1080, angle: 45, apply3d: true, audioOffset: 0 },
  elements: [],
  nextId: 1
});

let project   = DEFAULTS();
let resources = { images: [], audio: [] };

export const State = {
  getProject()    { return project; },
  getResources()  { return resources; },
  getElems()      { return project.elements; },
  getSettings()   { return project.settings; },
  getElem(id)     { return project.elements.find(e => e.id === id) || null; },
  nextId()        { return project.nextId++; },
  elemColor(idx)  { return ELEM_COLORS[idx % ELEM_COLORS.length]; },

  reset() {
    project   = DEFAULTS();
    resources = { images: [], audio: [] };
  },

  loadProject(data) {
    project   = data.project   || DEFAULTS();
    resources = data.resources || { images: [], audio: [] };
  },

  serialize() { return { project, resources }; }
};
