import * as d3 from 'd3';
import { handleErrors } from '../common/utils';

import {
  Row,
  Looker,
  LookerChartUtils,
  VisualizationDefinition
} from '../types/types'

declare var looker: Looker;
declare var LookerCharts: LookerChartUtils

function getDataStackValue(dataStack: any) {
  var currentSum = 0;
  Object.keys(dataStack).forEach((function(dataPivot) {
    currentSum += (dataStack[dataPivot].value || 0);
  }));

  return currentSum;
}

function getMaxStackValue(data: any, measures: any) {
  return Math.max(...measures.map(function (m: any) {
    return Math.max(...data.map(function(d: any) {
      return getDataStackValue(d[m.name]);
    }));
  }));
}

interface NestedColumnGraphVisualization extends VisualizationDefinition {
    svg?: any
}

const vis: NestedColumnGraphVisualization = {
  // Id and Label are legacy properties that no longer have any function besides documenting
  // what the visualization used to have. The properties are now set via the manifest
  // form within the admin/visualizations page of Looker
  id: "nested_column_graph",
  label: "Nested Column Graph",
  options: {
    font_size: {
      type: "string",
      label: "Font Size",
      values: [
        {"Large": "large"},
        {"Small": "small"}
      ],
      display: "radio",
      default: "large"
    }
  },
  
  create: function(element, config) {
    element.innerHTML = `
      <style>

      </style>
    `;

    this.svg = d3.select(element).append('svg')
    
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    if (!handleErrors(this, queryResponse, {
      min_pivots: 1, max_pivots: 1,
      min_dimensions: 1, max_dimensions: 1,
      min_measures: 1, max_measures: undefined
    })) return;

    console.log("data: ", data);
    console.log("element:" , element);
    console.log("config: ", config);
    console.log("queryResponse: ", queryResponse);
    console.log("details: ", details);
    console.log("done: ", done);

    const margin = {
      top: 20,
      right: 20,
      bottom: 60,
      left: 40
    };
    const width = element.clientWidth - margin.left - margin.right;
    const height = element.clientHeight - margin.top - margin.bottom;

    const dimension = queryResponse.fields.dimensions[0];
    const measures = queryResponse.fields.measures;
    const pivot = queryResponse.fields.pivots[0];
    const pivotValues = queryResponse.pivots;
    const pivotValueOrder: any = {};
    pivotValues.map(function(p) {
      pivotValueOrder[p["metadata"][pivot.name].value] = p["metadata"][pivot.name].sort_value
    });

    console.log("pivotValueOrder: ", pivotValueOrder);
    
    const palette = [
      "#4276be",
      "#3fb0d5",
      "#e57947",
      "#ffd95f",
      "#b42f37",
      "#6a013a",
      "#7363a9",
      "#44759a",
      "#fbb556",
      "#d5c679",
      "#9ed7d7",
      "#d59e79"
    ];

    const svg = this.svg!
        .html('')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      
    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    let dimensionX = d3.scaleBand()
      .rangeRound([0, width])
      .paddingInner(0.1)
      .domain(data.map(function(d) { return d[dimension.name].value; } ));

    let measureX = d3.scaleBand()
      .padding(0.05)
      .domain(measures.map(function(m) { return m.label_short }))
      .rangeRound([0, dimensionX.bandwidth()])
      .padding(0.2);
      
    let y = d3.scaleLinear()
      .range([height, 0])
      .domain([0, getMaxStackValue(data, measures)]);
    
    let colorScale = d3.scaleOrdinal()
      .range(palette)
      .domain(pivotValues.map(function(p) { return p["metadata"][pivot.name].value }));

    let stack = d3.stack()
        .offset(d3.stackOffsetNone);
    
    let flattenedData: any[] = [];
    data.map(function(d) {
        measures.map(function(m) {
            let dataPoint: any = {
                ["dimensionValue"]: d[dimension.name].value.toString(),
                ["measureName"]: m.label_short,
                ["links"]: d[dimension.name].links
            };

            pivotValues.map(function(p) {
                dataPoint[p["metadata"][pivot.name].value] = d[m.name][p.key].value || 0;
            });

            flattenedData.push(dataPoint);
        });
    });

    console.log("flattenedData: ", flattenedData);

    const stackData = stack
  	  .keys(pivotValues.map(function(p) { return p["metadata"][pivot.name].value }))(flattenedData);

    console.log("stackData: ", stackData);

    var serie = g.selectAll(".serie")
      .data(stackData)
      .enter().append("g")
        .attr("class", "serie")
        .attr("fill", function(d: any) { return palette[pivotValueOrder[d.key] % palette.length]; });
    
    serie.selectAll("rect")
      .data(function(d: any) { return d; })
      .enter().append("rect")
        .attr("class", "serie-rect")
        .attr("transform", function(d: any) { return "translate(" + dimensionX(d.data.dimensionValue) + ",0)"; })
        .attr("x", function(d: any) { return measureX(d.data.measureName); })
        .attr("y", function(d: any) { return y(d[1]); })
        .attr("height", function(d: any) { return y(d[0]) - y(d[1]); })
        .attr("width", measureX.bandwidth())
        .attr("cursor", "pointer")
        .on('click', function (this: any, d: any) {
          const event: object = { pageX: d3.event.pageX, pageY: d3.event.pageY }
          LookerCharts.Utils.openDrillMenu({
            links: d.data.links,
            event: event
          })
        });

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(dimensionX));
    
    g.selectAll(".x-axis")
      .selectAll("g")
      .selectAll("text")
        .attr("transform", "translate(0, 30)");
    
    measures.forEach(function(m: any) {
      g.selectAll(".x-axis")
        .selectAll("g")
        .append("text")
          .attr("x", measureX(m.name))
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .text(m.label_short);
    });

    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(y).ticks(null, "s"))
      .append("text")
        .attr("x", -(height/3))
        .attr("y", -35)
        .attr("dy", "0.32em")
        .attr("fill", "#000")
        .attr("font-weight", "bold")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-90)")
        .text(measures[0].label_short);
        
      console.log("-------------------------");
      done();
  }
};

looker.plugins.visualizations.add(vis);