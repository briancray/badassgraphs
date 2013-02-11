BadAssGraphs.protototype.toPNG = function () {
    // this is a work in progress. right now it just adds all the CSS inline and outputs the node to the console for testing
    var new_version = this.el.cloneNode(true),
        sheets = document.styleSheets,
        matches_selector = function (selector, element) { 
            var els = Array.prototype.slice.call(new_version.querySelectorAll(selector), 0);
            return els.filter(function (el) {
                return el === element; 
            }).length;
        },
        grabCSS = function (el) {
            var o = '';
            for (var x in sheets) {
                var rules = sheets[x].rules || sheets[x].cssRules;
                for (var y in rules) {
                    if (matches_selector(rules[y].selectorText, el)) {
                        o += rules[y].cssText.match('{\w*([^}]*)}')[1];
                    }
                }
            }
            return o;
        },
        convertCSStoinline = function (children) {
            children = Array.prototype.slice.call(children, 0);
            children.forEach(function (child) {
                if (!child.setAttribute) {
                }
                else {
                    child.nodeType === 1 && child.setAttribute('style', [child.getAttribute('style') || '', grabCSS(child)].join(';'));
                }
                convertCSStoinline(child.childNodes);
            });
        };
    convertCSStoinline(new_version.childNodes);
    console.log(new_version);
    var img = document.createElement('img');
    img.setAttribute('src', 'data:image/svg+xml;base64,' + btoa(new_version.innerHTML));
    document.body.appendChild(img);
};
