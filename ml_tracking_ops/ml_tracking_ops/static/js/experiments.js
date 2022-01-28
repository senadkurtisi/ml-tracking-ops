$(document).ready(function () {
  jQuery.ajaxSetup({ async: false });

  // Variables neccesarry for acquiring experiment data
  const experiment_id_url = "/get_experiment_data/";

  // Selected metrics
  let selectedMetrics = new Set([]);
  let chartHandlers = {};

  // For drawing experiment log data onto the chart
  const metricCharts = $(".experiment-metric-chart");
  const colors = ["red", "blue", "green", "gray", "pink"];

  // For selecting the data to display onto the chart
  let sidebarCheckboxes = $(".check-experiment");
  let sidebarRadios = $(".radio-experiment");
  let checkboxesCheckedNum = 1;
  let checkboxesChecked = [0];
  let experimentsSelected = [];
  let experimentData = [];


  /**
   * Initializes the workspace. Sets up the on-click events.
   * Applies the initial set-up necessary for the appropriate display of the DOM elements.
   */
  function init() {
    // Visual effect
    document.getElementById("nav-experiments").classList.add("active-tab");
    [...document.getElementsByClassName("sidebar-item-text")].forEach(
      (element) => {
        element.style.width = "65%";
      }
    );

    // Initiate the chart for each metric
    metricCharts.each((index) => {
      const metricName = metricCharts[index].dataset.metric;
      chartHandlers[metricName] = {
        ctx: metricCharts[index].getContext("2d"),
      };
      chartHandlers[metricName].chart = new Chart(chartHandlers[metricName].ctx, {});
    });

    // Radio buttons set-up
    for (let i = 0; i < sidebarRadios.length; i++) {
      sidebarRadios[i].style.width = "15%";

      sidebarRadios[i].onclick = function () {
        // Display data for the selected experiment(s)
        const experimentId = sidebarRadios[i].value;
        experimentsSelected = [experimentId];
        experimentData = [retrieveExperimentData(experimentId, chartHandlers)];
        populateMetricCharts(experimentData);

        // Radio buttons are mutually exclusive
        uncheckElements(sidebarRadios, i);
        uncheckElements(sidebarCheckboxes);
        checkboxesCheckedNum = 1;
        sidebarCheckboxes[i].checked = true;
      };
    }
    if(sidebarRadios.length > 0){
      sidebarRadios[0].click();
    } else {
      document.getElementById("experiments-title").innerHTML = "No experiment logs available.";
    }

    // Checkboxes set-up
    for (let i = 0; i < sidebarCheckboxes.length; i++) {
      sidebarCheckboxes[i].style.width = "15%";

      sidebarCheckboxes[i].onclick = function () {
        const experimentId = sidebarCheckboxes[i].value;
        experimentDataCurr = retrieveExperimentData(experimentId, chartHandlers);

        if (sidebarCheckboxes[i].checked) {
          checkboxesChecked.push(i);
          checkboxesCheckedNum++;
          
          // Remember the newly selected experiment data
          experimentsSelected.push(sidebarCheckboxes[i].value);
          experimentData.push(experimentDataCurr);

          if (checkboxesCheckedNum >= 2) {
            // We wish to show multiple training runs on the graph areas
            uncheckElements(sidebarRadios);
          }
          populateMetricCharts(experimentData);
        } else {
          // Remove the data related to the unselected experiment 
          checkboxesChecked.splice(checkboxesChecked.indexOf(i), 1);
          checkboxesCheckedNum = Math.max(0, checkboxesCheckedNum - 1);
          const tgtIdx = experimentsSelected.indexOf(sidebarCheckboxes[i].value);
          experimentsSelected.splice(tgtIdx, 1);
          experimentData.splice(tgtIdx, 1);

          sidebarRadios[i].checked = false;
          if (checkboxesCheckedNum == 0) {
            for (const metricName in chartHandlers) {
              chartHandlers[metricName].chart.destroy();
            }
          } else {
            populateMetricCharts(experimentData);
          }
        }
        if (checkboxesCheckedNum == 1) {
          sidebarRadios[checkboxesChecked[0]].click();
        }
      };
    }
  }

  /**
   * Unchecks all elements in the given list.
   * It's possible to exclude one element.
   * @param elementArray List of elements to uncheck
   * @param indexToKeep Position of the element which won't be unchecked
   */
  function uncheckElements(elementArray, indexToKeep = -1) {
    elementArray.each((index) => {
      if (indexToKeep != -1) {
        if (indexToKeep != index) {
          elementArray[index].checked = false;
        }
      } else {
        elementArray[index].checked = false;
      }
    });
  }

  /** 
   * Extracts specific property from the given list of objects.
   * This functionality is performed on a per object basis.
   * 
   * @param metricData Contains logs for different selected experiments
   * @param propertyName Propery to extract from these experiment logs 
   */
  function extractMetricProperty(metricData, propertyName) {
    return metricData.map((logEvent) => logEvent[propertyName]);
  }

  /**
   * Retrieves data for the selected experiment.
   * This data was previously loaded by the backend.
   * @param experimentId Id of the wanted experiment
   */
  function retrieveExperimentData(experimentId) {
    let loggedMetricData;
    $.get(`${experiment_id_url}/${experimentId}`, (experimentData) => {
      experimentData = JSON.parse(experimentData);

      // Extract names of the metrics logged during experiment
      const loggedMetricNames = Object.getOwnPropertyNames(experimentData);
      loggedMetricNames.forEach((metricName) => {
        selectedMetrics.add(metricName);
      });

      // Object which contains retrieved data for each metric
      loggedMetricData = loggedMetricNames.map(function(metricName) {
        const entries = [
          metricName,
          {
            timestamp: extractMetricProperty(experimentData[metricName], "time"),
            x: extractMetricProperty(experimentData[metricName], "step"),
            y: extractMetricProperty(experimentData[metricName], "value"),
          },
        ];
        return entries;
      });

      loggedMetricData = Object.fromEntries(loggedMetricData);
      loggedMetricData.experimentId = experimentId;
    });
    return loggedMetricData;
  }

  /**
   * Populates charts for every loaded metric and every selected experiment.
   * Graph lines from different experiments are drawn on the same graph if
   * the same metric was logged for both experiments.
   * 
   * @param metricData Logs of the selected experiments
   */
  function populateMetricCharts(metricData) {
    for (const metricName in chartHandlers) {
      // Extract the maximum timestep reached for the selected metric
      // for all experiments included
      const numberOfTimeStepsPerExperiment = metricData.map((element) => {
        return element.hasOwnProperty(metricName)? element[metricName].x[element[metricName].x.length - 1] : 0;
      });
      const maxXVal = Math.max(...numberOfTimeStepsPerExperiment);
      // Define x-axis for the according graph
      const xAxisLabels = [...Array(maxXVal).keys()];

      // Create a dataset object for each experiment for this metric (@metricName)
      let metricDatasets = metricData.map((element, index) => {
        const experimentDesc = {
          label: element.experimentId,
          data: element.hasOwnProperty(metricName)? element[metricName].y : [0.0,],
          borderColor: colors[index % colors.length],
          borderWidth: 1,
        };
        return experimentDesc;
      });

      // Draw the graphs
      chartHandlers[metricName]["chart"].destroy();
      chartHandlers[metricName]["chart"] = new Chart(
        chartHandlers[metricName]["ctx"],
        {
          type: "line",
          data: {
            labels: xAxisLabels,
            datasets: metricDatasets,
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 500,
            },
            scales: {
              y: {
                beginAtZero: true,
              },
            },

            elements: {
              point: {
                radius: maxXVal <= 25 ? 3 : 0, // Having circle points for large (dense) graph lines causes overhead
              },
            },

            plugins: {
              title: {
                display: true,
                text: metricName,
              },
              legend: {
                display: true,
              },
              tooltip: {
                displayColors: false,

                // color settings
                titleFontColor:  "rgb(255,255,255)",
                bodyFontColor:   "rgb(255,255,255)",
                footerFontColor: "rgb(255,255,255)",
                footerFontStyle: "normal",
                titleAlign:      "center",

                // Adapt tooltip to color of the graph line
                backgroundColor: function (item) {
                  return item.tooltip.labelColors[0].borderColor;
                },

                callbacks: {
                  // Display the value of the metric
                  title: function (item) {
                    const y_ = parseFloat(item[0].parsed.y).toFixed(3);
                    const titleRepresentation = `${metricName}: ${y_}`;
                    return titleRepresentation;
                  },

                  // Display the time passed from the start of the experiment
                  label: function (item) {
                    let relativeSeconds = parseFloat(
                      metricData[item.datasetIndex][metricName].timestamp[item.dataIndex]
                    ).toFixed(2);

                    let relativeTime;
                    if (relativeSeconds < 60) {
                      relativeTime = relativeSeconds + "s";
                    } else if (relativeSeconds < 3600) {
                      relativeSeconds = Math.floor(relativeSeconds);
                      const minutes = Math.floor(relativeSeconds / 60);
                      const seconds = relativeSeconds % 60;
                      relativeTime = `${minutes}m ${seconds}s`;
                    } else {
                      relativeSeconds = Math.floor(relativeSeconds);
                      const hours = Math.floor(relativeSeconds / 3600);
                      const remainingSeconds = relativeSeconds % 3600;
                      const minutes = Math.floor(remainingSeconds / 60);
                      const seconds = remainingSeconds % 60;
                      relativeTime = `${hours}h ${minutes}m ${seconds}s`;
                    }
                    const logStep = item.parsed.x;
                    labelRepresentation = `${relativeTime}  Step: ${logStep}`;
                    return labelRepresentation;
                  },

                  // Display the id of the experiment
                  footer: function (item) {
                    return item[0].dataset["label"];
                  },
                },
              },
            },
          },
        }
      );
    }
  }

  init();
});
