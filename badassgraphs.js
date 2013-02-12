;(function (window, d3, undefined) {

"use strict";

var get_type = function (v) {
    return Object.prototype.toString.call(v).split(' ')[1].split(']')[0].toLowerCase();
},

extend = function (target, source) {
    for (var x in source) {
        if (source.hasOwnProperty(x)) {
            target[x] = source[x];
        }
    }
    return target;
},

// refrerence to injected stylesheet that's used to apply default styles
stylesheet,

// used to add styles to a stylesheet rather than inline, which respects designer's CSS
add_stylesheet_rules = function (decls) {
    for (var i=0, dl = decls.length; i < dl; i++) {
        var j = 1, decl = decls[i], selector = decl[0], rulesStr = '';
        if (Object.prototype.toString.call(decl[1][0]) === '[object Array]') {
            decl = decl[1];
            j = 0;
        }
        for (var rl=decl.length; j < rl; j++) {
            var rule = decl[j];
            rulesStr += rule[0] + ':' + rule[1] + (rule[2] ? ' !important' : '') + ';\n';
        }
 
        if (stylesheet.insertRule) {
            stylesheet.insertRule(selector + '{' + rulesStr + '}', stylesheet.cssRules.length);
        }
        else { /* IE */
            stylesheet.addRule(selector, rulesStr, -1);
        }
    }
};

// inject stylesheet for default styles
(function () {
    var style = document.createElement('style'),
        head = document.getElementsByTagName('head')[0];
    head.childNodes[0] ? head.insertBefore(style, head.childNodes[0]) : head.appendChild(style);
    if (!window.createPopup) { /* For Safari */
       style.appendChild(document.createTextNode(''));
    }
    stylesheet = document.styleSheets[0];
})();

/*
data: [{
    name: 'series', // optional
    symbol: 'circle', // optional
    color: '#eee', // optional
    point_size: 30, // optional
    interpolation: null, //optional
    values: [{x: 0, y: 1}, {x: 1, y: 2}, ...]
}, ...]
type: 'line' or 'column' or 'bar'
interpolation: 'basis', 'cardinal' (default) or 'linear' (see https://github.com/mbostock/d3/wiki/SVG-Shapes#wiki-line_interpolate for options)
colors: ['#000', '#fff'] or d3 scale (see https://github.com/mbostock/d3/wiki/Ordinal-Scales#wiki-category10 for ready d3 scales)
margins: '0' or {top: 0, right: 0, bottom: 0, left: 0},
symbols: ['circle', 'triangle'] or d3 scale (see https://github.com/mbostock/d3/wiki/SVG-Shapes#wiki-symbol_type for symbols)
group: 'series' or 'points'
stack: true or false, stack the data (modified by group)
normalize: true of false, normalize points as a proportion of max
point_size: 0, number size of points
inner_radius: 10,
degrees: 360,
*/

var BadAssGraph = function (el, options) {
    // if this wasn't instantiated, return an instantiation (makes "new" unnecessary)
    if (!(this instanceof BadAssGraph)) {
        return new BadAssGraph(el, options);
    }
    var self = this;

    // keep a reference to the parent
    self.el = el = get_type(el) === 'string' ? document.querySelectorAll(el)[0] : el;

    // collection of <g>s
    self.groups = {};

    // reference to svg
    self.canvas = null;

    // reference to scales
    self.scales = {};

    // reference to events
    self.events = null;

    // reference to ranges
    self.ranges = {};

    // stores last point interacted with
    self.current_point = {};
    
    // merge the options with the defaults
    self.merge_options(el, options);

    // extend BadAssGraph with the type of graph requested
    self = extend(self, BadAssGraph[self.settings.type[0].toUpperCase() + self.settings.type.slice(1).toLowerCase()]);

    // go through the draw steps
    self.add_canvas()
        .add_data()
        .add_scales()
        .add_axis()
        .draw()
        .add_hover();

    return self;
};

BadAssGraph.defaults = {
    type: 'line', // line, bar, column, pie
    colors: d3.scale.category10(), // default color scale per series
    margins: 0, // margins of the plotting area (axis sit outside of margins)
    axis: [], // array of positions or array of options
    data: null // data to plot, null will generate data
};

BadAssGraph.prototype = {
    merge_options: function (el, options) {
        var self = this,
            settings,
            type = (options && options.type) || BadAssGraph.defaults.type,
            defaults = extend(extend({}, BadAssGraph.defaults), BadAssGraph[type[0].toUpperCase() + type.slice(1).toLowerCase()].defaults);

        // store original options
        self.options = options || {};

        // extend defaults with options argument
        self.settings = settings = extend(defaults, options || {});

        // create color scale (settings.colors can be a d3 scale or array)
        settings.colors = get_type(settings.colors) === 'array' ?
            d3.scale[settings.colors.length === 2 ? 'linear' : 'ordinal']().range(settings.colors) :
            settings.colors;

        // set margins based on settings (default is 0) (settings.margins can be a object with top, right, bottom, and left or a number)
        settings.margins = +settings.margins === +settings.margins ? 
            { top: +settings.margins, right: +settings.margins, bottom: +settings.margins, left: +settings.margins } :
            settings.margins || { top: 0, right: 0, bottom: 0, left: 0 };

        // get dimensions based on margins
        self.get_dimensions();

        return self;
    },

    get_dimensions: function () {
        var self = this,
            settings = self.settings,
            margins = settings.margins,
            el = self.el;

        // set width and height - margins
        settings.height = el.clientHeight - margins.top - margins.bottom;
        settings.width = el.clientWidth - margins.left - margins.right;

        return self;
    },
    
    add_canvas: function () {
        var self = this,
            settings = self.settings,
            groups = self.groups;

        // create a canvas if it doesn't already exist
        self.canvas = self.canvas || d3.select(self.el)
            .append('svg')
            .attr('class', settings.class || 'graph')
            .attr('width', self.el.clientWidth)
            .attr('height', self.el.clientHeight);

        // add background for series data
        self.canvas.append('rect')
            .classed('plot', true)
            .attr('width', settings.width)
            .attr('height', settings.height)
            .attr('x', settings.margins.left)
            .attr('y', settings.margins.top);

        // create an axis group if it doesn't exist
        groups.grid = groups.grid || self.canvas.append('g')
            .classed('grid', true);

        // create an svg and group for the plotted data
        groups.series = self.canvas.append('svg')
            .style('overflow', 'hidden')
            .attr('x', settings.margins.left)
            .attr('y', settings.margins.top)
            .attr('height', settings.height)
            .attr('width', settings.width)
            .append('g')
            .classed('all-series', true);

        // create an axis group if it doesn't exist
        groups.axis = groups.axis || self.canvas.append('g')
            .classed('axis', true);

        add_stylesheet_rules([
            ['.plot', ['fill', 'none']],
            ['.grid', ['shape-rendering', 'crispEdges']],
            ['.axis', ['shape-rendering', 'crispEdges']]
        ]); 

        return this;
    },

    add_data: function () {
        var self = this,
            settings = self.settings,
            d = settings.data || [];

        // if no data was passed, generate data
        if (!d.length) {
            var histogram, min;
            // generate random data: 3 series, between 0 and 120 with a distribution of 20
            while (d.length < 3) {
                d.push({
                    name: 'Sample ' + (d.length + 1),
                    values: []
                });
                histogram = d[d.length - 1].values;
                min = Math.floor(Math.random() * 100);
                while (histogram.length < 30) {
                    histogram.push({
                        x: histogram.length + 1,
                        y: min + Math.floor(Math.random() * 20)
                    });
                }
            }
            // set settings.data to generated data
            settings.data = d;
        }

        // turn data as a histogram into a series object
        else if (get_type(d[0]) === 'number') {
            settings.data = d = [{
                    name: 'My series',
                    values: d.map(function (d, i) {
                        return {x: i, y: d};
                    })
                }];
        }

        // handle histograms that don't have an x and y value
        else if (get_type(d[0].values[0]) === 'number') {
            d.forEach(function (series) {
                series.values = series.values.map(function (d, i) {
                    return {x: i, y: d};
                });
            });
        }

        // augment the data
        d.forEach(function (series) {
            series.class_name = self.friendly_name(series.name);
            series.values.forEach(function (point) {
                point.series = series;
                point.y0 = 0;
                point.original = {
                    x: point.x,
                    y: point.y
                };
            });
        });

        // stack the data if it's in the settings
        if (settings.stack) {
            self.stack_data();
        }

        // normalize the data if it's in the settings
        if (settings.normalize) {
            self.normalize_data();
        }

        // sort the data so the lowest line has the highest z-index
        d.sort(function (a, b) {
            var am = d3.median(a.values, function (d) {
                    return d.y0 + d.y;
                }),
                bm = d3.median(b.values, function (d) {
                    return d.y0 + d.y;
                });
            return bm - am
        });

        // record the x and y boundaries
        self.minmax_data();

        return self;
    },

    minmax_data: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            y_max = Number.NEGATIVE_INFINITY,
            y_min = Number.POSITIVE_INFINITY,
            x_max = Number.NEGATIVE_INFINITY,
            x_min = Number.POSITIVE_INFINITY;

        // set min max for current data
        data.forEach(function (series) {
            series.max = {
                x: d3.max(series.values, function (d) { return d.x }),
                y: d3.max(series.values, function (d) { return d.y + d.y0 })
            };
            series.min = {
                x: d3.min(series.values, function (d) { return d.x }),
                y: d3.min(series.values, function (d) { return d.y + d.y0 })
            };
            x_max = Math.max(x_max, series.max.x);
            x_min = Math.min(x_min, series.min.x);
            y_max = Math.max(y_max, series.max.y);
            y_min = Math.min(y_min, series.min.y);
        });

        // set a global max
        settings.max = {
            x: x_max,
            y: y_max
        };

        // set a global min
        settings.min = {
            x: x_min,
            y: y_min
        };

        return self;
    },

    stack_data: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            group = settings.group,
            type = settings.type;

        if (type === 'line' || group === 'points') {
            // add the previous point's value to this point
            data.forEach(function (series, i1) {
                if (i1 > 0) {
                    series.values.forEach(function (d, i2) {
                        var last = data[i1 - 1].values[i2];
                        d.y0 = last.y0 + last.y;
                    });
                }
            });
        }
        else if (group === 'series') {
            // reduce each series to the sum of the points
            data.forEach(function (series) {
                series.values = [series.values.reduce(function (a, b) {
                    a.y += b.y;
                    return a;
                })];
            });
        };
        
        return self;
    },

    normalize_data: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            max = Number.NEGATIVE_INFINITY,
            max_values = [];

        // find the maximum y value
        data[0].values.forEach(function (d, i) {
            max = Number.NEGATIVE_INFINITY;
            var s_max = d3.max(data, function (series) { return series.values[i].y + series.values[i].y0 });
            max_values.push(Math.max(s_max, max));
        });

        // set each point as a proportion of the maximum y
        data.forEach(function (series) {
            series.values.forEach(function (d, i) {
                d.y /= max_values[i];
                d.y0 /= max_values[i];
            });
        });

        return self;
    },
        
    add_scales: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            max = settings.max,
            min = settings.min;

        // add standard scales (can be overridden later with add_scale())
        self.add_scale('y', d3.scale.linear().domain([max.y, 0]).range([0, settings.height]).nice());
        self.add_scale('x', d3.scale.linear().domain([min.x, max.x]).range([0, settings.width]));
        self.add_scale('colors', settings.colors.domain([0, data.length - 1]));

        return self;
    },

    add_scale: function (name, scale) {
        // scale argument must be a d3 scale, overrides any existing scales of the same name
        this.scales[name] = scale;

        return this;
    },

    add_axis: function () {
        var self = this,
            settings = self.settings,
            scales = self.scales,
            groups = self.groups,
            axis = settings.axis || [];

        // add an axis for each argument passed (top, bottom, left, right)
        (get_type(axis) === 'array' ? axis : axis ? [axis] : []).forEach(function (axis) {
            var svg_axis,
                marginize,
                translation;
            
            // if the axis is a string, turn it into an object
            axis = get_type(axis) === 'string' ? {position: axis} : axis;

            // set which dimension the axis will affect
            marginize = axis.position == 'top' || axis.position == 'bottom' ? 'height' : 'width';

            // transform attribute to position correctly
            translation = 'translate(' + (settings.margins.left + (axis.position === 'right' ? settings[marginize] : 0)) + ',' + (settings.margins.top + (axis.position === 'bottom' ? settings[marginize] : 0)) + ')';

            // extend axis argument with defaults
            axis = extend({
                // position will always be overridden by argument, just here for completedness
                position: 'left',

                // a formatter function (text) to pass all labels through, defaults to raw label
                formatter: null,

                // optional, override with a specific scale
                scale: null,

                // whether to intelligently round the min and max values
                nice: true,

                // how much padding between ticks and labels
                padding: 1

            }, axis);

            // create d3's axis constructor
            svg_axis = d3.svg.axis()
                .scale(axis.scale || marginize === 'height' ? scales.x : scales.y)
                .orient(axis.position)
                .tickPadding(axis.padding)
                .tickFormat(axis.formatter);

            // create a group for this specific axis
            groups.axis.append('g')
                .classed(axis.position + '-axis', true)
                .call(svg_axis)
                // move axis group, respecting original margins
                .attr('transform', translation);

            // create a group for grid lines that align with the axis ticks
            groups.grid.append('g')
                .classed(axis.position + '-grid', true)
                .call(svg_axis.tickSize(-settings[marginize]).tickFormat(''))
                .attr('transform', translation);
        });

        add_stylesheet_rules([
            ['.axis path', ['fill', 'none'], ['stroke', '#000']],
            ['.axis line', ['stroke', '#000']],
            ['.grid path', ['fill', 'none']]
        ]); 

        return self;
    },

    add_hover: function () {
        var self = this,
            groups = self.groups,
            mouseover = function (d, i) {
                self.current_point = {
                    series: d.series,
                    point: d,
                    index: i,
                    el: d3.event.target
                };
            };

        // ensures that mouseover events have access to .get_point()
        groups.series.selectAll('.series-point').on('mouseover', mouseover);

        return self;
    },

    friendly_name: function (s) {
        // generate a name that is appropriate for CSS classes
        return s.toLowerCase().replace(/[^a-z1-9]/g, '-');
    },

    get_point: function () {
        // return last point interacted with
        return this.current_point;
    }
};

BadAssGraph.Line = {
    defaults: {
        interpolation: 'cardinal', // cardinal, linear, step-before (for line and area), basis
        symbols: ['circle'], // circle, triangle, square
        point_size: 0, // size of points
        stack: false, // whether to stack the data
        normalize: false // whether to normalize the data
    },

    add_scales: function () {
        var self = this,
            settings = self.settings,
            data = settings.data;

        BadAssGraph.prototype.add_scales.call(self); 

        // create symbol scale (settings.symbols can be a d3 scale or array)
        settings.symbols = get_type(settings.symbols) === 'array' ?
            d3.scale.ordinal().range(settings.symbols) :
            settings.symbols;

        self.add_scale('symbols', settings.symbols.domain([0, data.length - 1]));

        return self;
    },

    draw: function () {
        var self = this,
            settings = self.settings,
            groups = self.groups,
            data = settings.data;

        // add groups for each series
        groups.lines = data.map(function (d, i) {
            return groups.series.append('g')
                .classed(d.class_name, true)
                .classed('series', true);
        });
        
        // add each series to the graph
        data.forEach(function (d, i) {
            self.add_series(d, i);
        });

        return self;
    },

    add_series: function (series, index) {
        var self = this,
            settings = self.settings,
            scales = self.scales,
            group = self.groups.lines[index],
            selector = '.' + series.class_name,
            x = scales.x,
            y = scales.y,
            histogram = series.values,
            color = series.color || scales.colors(index),
            symbol = series.symbol || scales.symbols(index),
            point_size = series.point_size || settings.point_size,
            interpolation = series.interpolation || settings.interpolation,
            line = d3.svg.line()
                .x(function (d) {
                    return x(d.x);
                })
                .y(function (d, i) {
                    return y(d.y + d.y0);
                })
                .interpolate(interpolation),
            fill = d3.svg.area()
                .x(function (d) {
                    return x(d.x);
                })
                .y0(function (d, i) {
                    return y(d.y0);
                })
                .y1(function (d, i) {
                    return y(d.y0 + d.y);
                })
                .interpolate(interpolation);

        // prepare for animation: position group below graph (out of site)
        group.attr('transform', 'translate(0,' + settings.height + ')')

        // append the fill to the group
        group.append('path')
            .classed('series-fill', true)
            .attr('d', fill(histogram));
                    
        // append the line to the group
        group.append('path')
            .classed('series-line', true)
            .attr('d', line(histogram));

        // append the visible points on the graph
        group.selectAll('points')
            .data(histogram)
            .enter()
            .append('path')
            .attr('transform', function (d) {
                return 'translate(' + x(d.x) + ',' + y(d.y + d.y0) + ')';
            })
            .attr('d', d3.svg.symbol().type(symbol).size(point_size))
            .classed('series-point', true);

        // animate the group upward into view
        group.transition()
            .delay(index * 100)
            .duration(300)
            .attr('transform', 'translate(0,0)');

        add_stylesheet_rules([
            [selector + ' .series-point', ['stroke', color], ['fill', color]],
            [selector + ' .series-line', ['stroke', color], ['fill', 'none']],
            [selector + ' .series-fill', ['stroke', 'none'], ['fill', color]]
        ]); 

        return self;
    },

    add_hover: function () {
        var self = this,
            settings = self.settings,
            options = self.options,
            scales = self.scales,
            data = settings.data,
            groups = self.groups,
            group = groups.hover || (groups.hover = self.canvas.append('g').attr('transform', 'translate(' + settings.margins.left + ',' + settings.margins.top + ')')),
            x = scales.x,
            y = scales.y,
            y0 = scales.y0,
            all_points = [],
            point_map = [],
            mouseover = function (d, i) {
                var e = d3.event,
                    evt = document.createEvent('MouseEvent');
                self.current_point = point_map[i];
                evt.initMouseEvent('mouseover', true, true, e.view, e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                point_map[i].el.dispatchEvent(evt);
            },
            mouseout = function (d, i) {
                var e = d3.event,
                    evt = document.createEvent('MouseEvent');
                evt.initMouseEvent('mouseout', true, true, e.view, e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                point_map[i].el.dispatchEvent(evt);
            };
        
        // generate the data for the augmented points
        data.forEach(function (series, i1) {
            var points = groups.lines[i1][0][0].getElementsByClassName('series-point');
            all_points = all_points.concat(series.values.map(function (d, i2) {
                point_map.push({
                    series: series,
                    point: d,
                    index: i2,
                    el: points[i2]
                });
                return [x(d.x), y(d.y + d.y0)];
            }));
        });

        // create clipping areas for augmented hover points
        group.selectAll('clipPath')
            .data(all_points)
            .enter().append('clipPath')
            .attr('id', function(d, i) {
                return 'hover-' + i;
            })
            .append('circle')
            .attr('cx', function(d) { return d[0] })
            .attr('cy', function(d) { return d[1] })
            .attr('r', 20);

        // generate voronoi overlay of points
        group.selectAll('path')
            .data(d3.geom.voronoi(all_points))
            .enter()
            .append('path') 
            .attr('d', function (d) {
                return 'M' + d.join(',') + 'Z';
            })
            .attr('clip-path', function(d, i) {
                return 'url(#hover-' + i +')';
            })
            .style('fill', 'rgba(0, 0, 0, 0)')
            .on('mouseover', mouseover)
            .on('mouseout', mouseout);

        return self;
    }
};

BadAssGraph.Column = {
    defaults: {
        group: 'points', // whether to group certain graphs by series or points (x-value)
        stack: false, // whether to stack the data
        normalize: false // whether to normalize the data
    },

    draw: function () {
        var self = this,
            settings = self.settings,
            groups = self.groups,
            data = settings.data;

        // add groups for each series
        groups.columns = data.map(function (d, i) {
            return groups.series.append('g')
                .classed(d.class_name, true)
                .classed('series', true);
        });

        // run add_series() for each series
        data.forEach(function (d, i) {
            self.add_series(d, i);
        });

        return self;
    },

    add_scales: function () {
        var self = this,
            settings = self.settings;

        BadAssGraph.prototype.add_scales.call(self); 

        // generate x scales appropriate for a bar graph, based on grouping of points
        self['add_scales_' + settings.group]()

        return self;
    },

    add_scales_series: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            padding = 0;

        if (settings.stack) {
            padding = (padding = data.length / settings.width * 2) > .5 ? .5 : padding;
        }

        self.add_scale('x', d3.scale.ordinal()
            .domain(data.map(function (d) {
                return d.name;
            }))
            .rangeRoundBands([0, settings.width], padding));

        padding = (padding = data[0].values.length / self.scales.x.rangeBand() * 2) > .5 ? .5 : padding;

        self.add_scale('x1', d3.scale.ordinal()
            .domain(data[0].values.map(function (d) {
                return d.x
            }))
            .rangeRoundBands([0, self.scales.x.rangeBand()], padding));

        return self;
    },

    add_scales_points: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            padding = 0;

        if (settings.stack) {
            padding = (padding = data[0].values.length / settings.width * 2) > .5 ? .5 : padding;
        }

        self.add_scale('x', d3.scale.ordinal()
            .domain(data[0].values.map(function (d) {
                return d.x;
            }))
            .rangeRoundBands([0, settings.width], padding));

        padding = (padding = data.length / self.scales.x.rangeBand() * 2) > .5 ? .5 : padding;

        self.add_scale('x1', d3.scale.ordinal()
            .domain(data.map(function (d) {
                return d.name;
            }))
            .rangeRoundBands([0, self.scales.x.rangeBand()], padding));

        return self;
    },

    add_series: function (series, index) {
        var self = this,
            settings = self.settings,
            scales = self.scales,
            group = self.groups.columns[index],
            selector = '.' + series.class_name,
            x = scales.x,
            x1 = scales.x1,
            y = scales.y,
            histogram = series.values,
            color = series.color || scales.colors(index);

        group.attr('transform', 'translate(0,' + settings.height + ')');

        group.selectAll('rect')
            .data(histogram)
            .enter()
            .append('rect')
            .attr('width', settings.stack ? x.rangeBand() : x1.rangeBand())
            .attr('height', function (d) {
                return settings.height - y(d.y);
            })
            .attr('x', function (d) {
                if (settings.group === 'points') {
                    return x(d.x) + (settings.stack ? 0 : x1(index));
                }
                else {
                    return x(index) + (settings.stack ? 0 : x1(d.x));
                }
            })
            .attr('y', function (d) {
                return y(d.y + d.y0);
            })
            .classed('series-point', true);

        group.transition()
            .delay(index * 100)
            .duration(300)
            .attr('transform', 'translate(0,0)');

        add_stylesheet_rules([
            [selector + ' .series-point', ['stroke', color], ['fill', color], ['shape-rendering', 'crispEdges']]
        ]); 

        return self;
    }
};

BadAssGraph.Bar = {
    defaults: {
        group: 'points', // whether to group certain graphs by series or points (x-value)
        stack: false, // whether to stack the data
        normalize: false // whether to normalize the data
    },

    draw: function () {
        var self = this,
            settings = self.settings,
            groups = self.groups,
            data = settings.data;

        // add groups for each series
        groups.columns = data.map(function (d, i) {
            return groups.series.append('g')
                .classed(d.class_name, true)
                .classed('series', true);
        });

        // run add_series() for each series
        data.forEach(function (d, i) {
            self.add_series(d, i);
        });

        return self;
    },

    add_scales: function () {
        var self = this,
            settings = self.settings;

        BadAssGraph.prototype.add_scales.call(self);

        // generate x scales appropriate for a bar graph, based on grouping of points
        self['add_scales_' + settings.group]()

        self.add_scale('x', d3.scale.linear().domain([0, settings.max.y]).range([0, settings.width]).nice());

        return self;
    },

    add_scales_series: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            padding = 0;

        if (settings.stack) {
            padding = (padding = data.length / settings.height * 2) > .5 ? .5 : padding;
        }

        self.add_scale('y', d3.scale.ordinal()
            .domain(data.map(function (d) {
                return d.name;
            }))
            .rangeRoundBands([0, settings.height], padding));

        padding = (padding = data[0].values.length / self.scales.y.rangeBand() * 2) > .5 ? .5 : padding;

        self.add_scale('y1', d3.scale.ordinal()
            .domain(settings.data[0].values.map(function (d) {
                return d.x
            }))
            .rangeRoundBands([0, self.scales.y.rangeBand()], padding));

        return self;
    },

    add_scales_points: function () {
        var self = this,
            settings = self.settings,
            data = settings.data,
            padding = 0;

        if (settings.stack) {
            padding = (padding = data[0].values.length / settings.height * 2) > .5 ? .5 : padding;
        }

        self.add_scale('y', d3.scale.ordinal()
            .domain(data[0].values.map(function (d) {
                return d.x
            }))
            .rangeRoundBands([0, settings.height], padding));

        padding = (padding = data.length / self.scales.y.rangeBand() * 2) > .5 ? .5 : padding;

        self.add_scale('y1', d3.scale.ordinal()
            .domain(data.map(function (d) {
                return d.name;
            }))
            .rangeRoundBands([0, self.scales.y.rangeBand()], padding));

        return self;
    },

    add_series: function (series, index) {
        var self = this,
            settings = self.settings,
            scales = self.scales,
            group = self.groups.columns[index],
            selector = '.' + series.class_name,
            color = series.color || settings.colors(index),
            x = scales.x,
            y = scales.y,
            y1 = scales.y1,
            histogram = series.values;

        group.attr('transform', 'translate(' + (-settings.width) + ',0)');

        group.selectAll('rect')
            .data(histogram)
            .enter()
            .append('rect')
            .attr('width', function (d) {
                return x(d.y);
            })
            .attr('height', settings.stack ? y.rangeBand() : y1.rangeBand())
            .attr('x', function (d) {
                return x(d.y0);
            })
            .attr('y', function (d) {
                if (settings.group === 'points') {
                    return y(d.x) + (settings.stack ? 0 : y1(index));
                }
                else {
                    return y(index) + (settings.stack ? 0 : y1(d.x));
                }
            })
            .classed('point', true);

        group.transition()
            .delay(index * 10)
            .duration(300)
            .attr('transform', 'translate(0,0)');

        add_stylesheet_rules([
            [selector + ' rect', ['stroke', color], ['fill', color], ['shape-rendering', 'crispEdges']]
        ]); 

        return self;
    }
};

BadAssGraph.Pie = {
    defaults: {
        stack: true, // whether to stack the data
        inner_radius: 10, // inner radius of pie graphs
        degrees: 360, // degrees of total pie graph
        starting_degrees: 0 // starting degrees of the first pie piece
    },

    draw: function () {
        var self = this,
            settings = self.settings,
            groups = self.groups,
            data = settings.data;

        // add groups for each series
        groups.pies = data.map(function (d, i) {
            return groups.series.append('g')
                .classed(d.class_name, true)
                .classed('series', true);
        });

        self.prev_angle = self.settings.min.y;

        data.forEach(function (d, i) {
            self.add_series(d, i);
        });

        return self;
    },

    add_scales: function () {
        var self = this,
            settings = self.settings,
            data = settings.data;

        BadAssGraph.prototype.add_scales.call(self);

        var sum = data.reduce(function (value, series) {
            return value + series.values.reduce(function (value2, d) {
                return value2 + d.y;
            }, 0);
        }, settings.min.y);

        self.add_scale('y', d3.scale.linear().domain([settings.min.y, sum]).range([settings.starting_degrees * (Math.PI/180), (settings.starting_degrees + settings.degrees) * (Math.PI/180)]));

        return self;
    },

    add_series: function (series, index) {
        var self = this,
            settings = self.settings,
            scales = self.scales,
            group = self.groups.pies[index],
            selector = '.' + series.class_name,
            histogram = series.values,
            y = scales.y,
            color = series.color || scales.colors(index),
            prev_angle = self.prev_angle,
            arc0 = d3.svg.arc()
                .innerRadius(settings.inner_radius)
                .outerRadius(settings.inner_radius)
                .startAngle(function (d) {
                    return y(prev_angle);
                })
                .endAngle(function (d) {
                    return y(prev_angle += d.y);
                }),
            arc = d3.svg.arc()
                .innerRadius(settings.inner_radius)
                .outerRadius(settings.height / 2)
                .startAngle(function (d) {
                    return y(self.prev_angle);
                })
                .endAngle(function (d) {
                    return y(self.prev_angle += d.y);
                });

        // prepare for animation: position group below graph (out of site)
        group.attr('transform', 'translate(' + settings.width / 2 + ',' + settings.height / 2 + ')');

        // append the fill to the group
        group.selectAll('path')
            .data(histogram)
            .enter()
            .append('path')
            .classed('series-point', true)
            .attr('d', arc0);
        /*
        group.selectAll('.second')
            .data(histogram)
            .enter()
            .append('path')
            .classed('series-point', true)
            .attr('d', outer_arc);
        */

        // animate the group upward into view
        group.selectAll('path')
            .transition()
            .delay(index * 100)
            .duration(300)
            .attr('d', arc);

        self.prev_outer_angle = settings.min.x;

        add_stylesheet_rules([
            [selector + ' .series-point', ['stroke', color], ['fill', color]],
        ]); 

        return self;
    }
};

if (typeof define !== 'undefined' && define.amd) { return BadAssGraph; }
else if (typeof module !== 'undefined' && module.exports) { module.exports = BadAssGraph; }
else { window.BadAssGraph = BadAssGraph; }

})(window, d3);
