$(document).ready(function () {
  jQuery.ajaxSetup({ async: false });

  // Usage: Current state of the sweep UI
  let currentSweepLogs;
  let currentSweepConfig;
  let currentMetricDisplayed;
  let earlyStopping = true;

  // Variables necessary for acquiring experiment data
  const sweep_id_url = "/get_sweep_data/";

  // For selecting the data to display onto the chart
  let sidebarRadios = $(".radio-experiment");

  // Sweep chart: Displays only a single metric
  const ctx = document.getElementById("sweep-metric-chart").getContext("2d");
  let sweepChart = new Chart(ctx, {});
  let metricChoiceDropdown = document.getElementById("metric-choice");
  const colors = ["red", "blue", "green", "black", "rgb(217, 160, 4)"];

  // Sweep configuration elements
  let sweepConfigContainers = {
    main_script_name: document.getElementById("main_script_name"),
    max_runs: document.getElementById("max_runs"),
    optimization_metric: document.getElementById("optimization_metric"),
    optimization_goal: document.getElementById("optimization_goal"),
    hyperparameters: document.getElementById("hyperparameters"),
  };
  let hyperparamDescTable = document.getElementById("hyperparam-desc-table");

  // For describing each sweep run
  let tableHeaders = document.getElementById("table-header");
  let tableBody = document.getElementsByTagName("tbody")[0];
  let hyperparameterHeaderOrder = [];
  // For navigating through runs
  const minPage = 1;
  let maxPages = 1;
  const maxRunsPerPage = 5;
  let currentPage = 1;
  let totalRuns = 0;
  let prevRunsBtn = document.getElementById("prev-runs-btn");
  let nextRunsBtn = document.getElementById("next-runs-btn");


  /**
   * Initializes the workspace. Sets up the on-click events.
   * Applies the initial set-up necessary for the appropriate display of the DOM elements.
   */
  function init() {
    // Visual effect
    document.getElementById("nav-sweeps").classList.add("active-tab");
    [...document.getElementsByClassName("sidebar-item-text")].forEach(
      (element) => {
        element.style.width = "65%";
      }
    );
    currentPage = 1;
    $(prevRunsBtn).prop("disabled", true);

    // Radio-buttons set-up
    for (let i = 0; i < sidebarRadios.length; i++) {
      sidebarRadios[i].style.width = "15%";

      sidebarRadios[i].onclick = function () {
        currentPage = 1;
        $(prevRunsBtn).prop("disabled", true);
        $(nextRunsBtn).prop("disabled", false);

        // Radio buttons are mutually exclusive
        uncheckElements(sidebarRadios, i);

        // Retrieve data for the selected sweep
        const experimentId = sidebarRadios[i].value;
        const sweepData = retrieveSweepData(experimentId);

        // Update current state of the retrieved sweep data
        currentSweepConfig = sweepData.sweepConfiguration;
        currentSweepLogs = sweepData.sweepLogs;
        currentMetricDisplayed = currentSweepConfig["optimization_metric"];
        metricChoiceDropdown.value = currentMetricDisplayed;
        earlyStopping = currentSweepLogs["optimization_metric"] != "/";

        // Update the Number of pages monitor
        totalRuns = currentSweepLogs.length;
        maxPages = Math.floor(totalRuns / maxRunsPerPage);
        maxPages += totalRuns % maxRunsPerPage == 0 ? 0 : 1;

        // Not all sweeps need to have all metrics logged
        currentSweepLogs.map((element) => {
          if (!element.hasOwnProperty(currentMetricDisplayed)) {
            element[currentMetricDisplayed] = [0.0];
          }
          return element;
        });

        populateTableHeader(
          Object.getOwnPropertyNames(currentSweepConfig["hyperparameters"]),
          currentSweepConfig["optimization_metric"]
        );
        populateSweepConfig(currentSweepConfig, sweepConfigContainers);
        updateRunsUI();
      };
    }
    if(sidebarRadios.length > 0){
      sidebarRadios[0].click();
    } else {
      document.getElementById("sweeps-title").innerHTML = "No sweeps logs available.";
    }
  }

  // Update the metric currently shown on the sweep graph
  metricChoiceDropdown.addEventListener("change", (event) => {
    currentMetricDisplayed = event.target.value;
    // Some runs don't have the desired metric logged
    currentSweepLogs.map((element) => {
      if (!element.hasOwnProperty(currentMetricDisplayed)) {
        element[currentMetricDisplayed] = [0.0];
      }
      return element;
    });

    const startIndex = (currentPage - 1) * maxRunsPerPage;
    const endIndex = currentPage * maxRunsPerPage;
    populateSweepChart(
      currentSweepLogs.slice(startIndex, endIndex),
      currentMetricDisplayed
    );
  });

  /**
   * Moves to the next page of sampled hyperparameter combinations.
   */
  nextRunsBtn.addEventListener("click", () => {
    $(prevRunsBtn).prop("disabled", false);

    if (currentPage < maxPages) {
      currentPage++;
      updateRunsUI();

      if (currentPage == maxPages) {
        $(nextRunsBtn).prop("disabled", true);
      }
    }
  });

  /**
   * Moves to the previous page of sampled hyperparameter combinations.
   */
  prevRunsBtn.addEventListener("click", () => {
    $(nextRunsBtn).prop("disabled", false);
    if (currentPage > minPage) {
      currentPage--;
      updateRunsUI();

      if (currentPage == minPage) {
        $(prevRunsBtn).prop("disabled", true);
      }
    }
  });

  /**
   * Unchecks all elements in the given list.
   * It's possible to exclude one element.
   * 
   * @param  elementArray List of elements to uncheck
   * @param  indexToKeep Position of the element which won't be unchecked
   */
   function uncheckElements(elementArray, indexToKeep = -1) {
    elementArray.each((index) => {
      if (indexToKeep != index) {
        elementArray[index].checked = false;
      } else {
        elementArray[index].checked = true;
      }
    });
  }

  /** 
   * Extracts specific property from the given list of objects.
   * This functionality is performed on a per object basis.
   * 
   * @param metricData List of different experiment logs
   * @param propertyName Propery to extract from these experiment logs
   */
  function extractProperty(metricData, propertyName) {
    return metricData.map((logEvent) => logEvent[propertyName]);
  }

  /**
   * Retrieves data for the selected sweep.
   * This data was previously loaded by the backend.
   * @param  {{string}} sweepId Id of the wanted sweep
   */
   function retrieveSweepData(sweepId) {
    let sweepConfiguration;
    let sweepLogs;

    $.get(`${sweep_id_url}/${sweepId}`, (retrievedData) => {
      retrievedData = JSON.parse(retrievedData);

      // Configuration (description) of the sweep set-up
      sweepConfiguration = retrievedData["sweep_config"];
      // Logs of the separate training runs
      sweepLogs = retrievedData["experiment_data"];
    });
    return { sweepConfiguration, sweepLogs };
  }

  /**
   * Updates the metric chart and the sampled hyperparameters table.
   * These elements only show data for the selected page of the training runs.
   * Training run = One hyperparameter combination
   */
  function updateRunsUI() {
    const startIndex = (currentPage - 1) * maxRunsPerPage;
    const endIndex = currentPage * maxRunsPerPage;

    populateSelectedRunsInfo(
      currentSweepConfig["sampled_hyperparameters"].slice(startIndex, endIndex)
    );
    populateSweepChart(
      currentSweepLogs.slice(startIndex, endIndex),
      currentMetricDisplayed
    );
  }

  /**
   * Retrieves the best value for the optimization metric.
   * It adapts to the optimization goal. 
   * 
   * @param runIndex Index of the desired run in the logs of the selected sweep
   */
   function getBestMetricValue(runIndex) {
    let metricData = currentSweepLogs[runIndex][currentSweepConfig["optimization_metric"]];
    if (metricData.length == 1) {
      return (typeof metricData[0] == "number")? metricData[0] : "/";
    }
    metricData = metricData.map((element) => element.value);
    return currentSweepConfig["optimization_goal"] == "max"? Math.max(...metricData) : Math.min(...metricData);
  }
            
  /**
   * Populates the header of the sampled hyperparameters table.
   * 
   * @param hyperparameters List of hyperparameter names to place in header
   * @param metricToOptimize Optimization metric for the selected sweep
   */
  function populateTableHeader(hyperparameters, metricToOptimize) {
    // Reset the table header
    tableHeaders.innerHTML = "";
    hyperparameterHeaderOrder = [];
     
    // Run number
    let runNum = document.createElement("TH");
    runNum.innerHTML = "Run number";
    runNum.classList.add("table-header-item");
    tableHeaders.appendChild(runNum);
     
    if (earlyStopping) {
      // Best value of the metric to optimize
      let bestMetricValue = document.createElement("TH");
      bestMetricValue.innerHTML = `Best ${metricToOptimize}`;
      bestMetricValue.classList.add("table-header-item");
      tableHeaders.appendChild(bestMetricValue);
    }
     
    // Add column for each hyperparameter that was sampled
    for (const hyperparameter of hyperparameters) {
      let hyperparamField = document.createElement("TH");
      hyperparamField.innerHTML = hyperparameter;
      hyperparamField.classList.add("table-header-item");
      tableHeaders.appendChild(hyperparamField);  
      hyperparameterHeaderOrder.push(hyperparameter);
    }
  }
    
  /**
   * Populates the info regarding the separate training runs.
   * Displays only the data related to the selected page.
   * 
   * @param sampledHyperparametersGroup Contains sampled values of hyperparameter
   *   for each run on the selected page
   */
  function populateSelectedRunsInfo(sampledHyperparametersGroup) {
    // Reset the table
    $("#runs-table").find("tr:not(:first)").remove();
    const initIndex = (currentPage - 1) * maxRunsPerPage + 1;
    sampledHyperparametersGroup.forEach((sampledHyperparameters, index) => {
      // Descriptor of the run
      let runDesc = document.createElement("TR");

      // Run Number
      let runNum = document.createElement("TD");
      runNum.innerHTML = `Run ${initIndex + index}`;
      runNum.classList.add("run-desc-item");
      runDesc.appendChild(runNum);

      if (earlyStopping) {
        // Best metric value
        let bestMetricValue = document.createElement("TD");
        // Optimization hyperparameter does not have to be a strin
        try {
          let bestVal = getBestMetricValue(initIndex + index - 1);
          bestMetricValue.innerHTML = bestVal.toExponential(3);
          
        } catch {
          bestMetricValue.innerHTML = getBestMetricValue(initIndex + index - 1);
        }
        bestMetricValue.classList.add("run-desc-item");
        runDesc.appendChild(bestMetricValue);
      }
      
      // Populate the data for each hyperparameter
      for (const hyperparameter of hyperparameterHeaderOrder) {
        let hyperparameterField = document.createElement("TD");
        let hyperparamData = sampledHyperparameters[hyperparameter];

        // Hyperparameter does not have to be a number
        if (typeof (hyperparamData == "number")) {
          hyperparamData = (parseInt(hyperparamData) == parseFloat(hyperparamData))? 
            parseInt(hyperparamData) : parseFloat(hyperparamData).toExponential(5);
        }
        hyperparameterField.innerHTML = hyperparamData;
        hyperparameterField.classList.add("run-desc-item");
        runDesc.appendChild(hyperparameterField);
      }
      tableBody.appendChild(runDesc);
    });
  }

  /**
   * Populates the description/configuration of the hyperparameter sweep
   * @param sweepConfiguration Sweep description
   * @param sweepConfigContainers Placeholders for the sweep config content
   */
  function populateSweepConfig(sweepConfiguration, sweepConfigContainers) {
    for (sweepConfigKey in sweepConfiguration) {
      if (sweepConfigKey !== "sampled_hyperparameters") {
        // This element should contain the exact definition for the sweep configuration key
        let sweepConfigValueElement = sweepConfigContainers[sweepConfigKey].children[1];
        if (sweepConfigKey == "hyperparameters") {
          // Reset the table
          hyperparamDescTable.innerHTML = "";

          const hyperparamDescTotal = sweepConfiguration[sweepConfigKey];
          for (const hyperparam in hyperparamDescTotal) {
            // Single hyperparameter description container
            let hyperperparamDescSingleRow = document.createElement("TR");

            // Hyperparameter name
            let hyperparamName = document.createElement("TD");
            hyperparamName.innerHTML = hyperparam;
            hyperparamName.classList.add("hyperparam-desc-cell");
            hyperparamName.classList.add("hyperparam-desc-cell-title");
            hyperparamName.style.fontSize = "0.9em";
            hyperperparamDescSingleRow.appendChild(hyperparamName);

            // Hyperparameter type
            let hyperparamType = document.createElement("TD");
            hyperparamType.innerHTML =
              hyperparamDescTotal[hyperparam].hyp_type == "uniform"? "Continuous" : "Discrete";
            hyperparamType.style.fontSize = "0.8em";
            hyperparamType.classList.add("hyperparam-desc-cell");
            hyperperparamDescSingleRow.appendChild(hyperparamType);

            // Description of the hyperparameter sampling procedure
            let hyperparamDescSingle = document.createElement("TD");
            let hyperparamDescSingleDiv = document.createElement("div");
            hyperparamDescSingleDiv.innerHTML =
              hyperparamDescTotal[hyperparam].hyp_desc;
            hyperparamDescSingleDiv.style.fontSize = "0.8em";
            hyperparamDescSingleDiv.classList.add("hyperparam-desc-sampler");

            hyperparamDescSingle.classList.add("hyperparam-desc-cell");
            hyperparamDescSingle.appendChild(hyperparamDescSingleDiv);
            hyperperparamDescSingleRow.appendChild(hyperparamDescSingle);

            hyperparamDescTable.appendChild(hyperperparamDescSingleRow);
          }
        } else {
          const noEarlyStopping = "No early stopping was performed."
          let descValue = (sweepConfiguration[sweepConfigKey] == "/")? noEarlyStopping : sweepConfiguration[sweepConfigKey];

          sweepConfigValueElement.innerHTML = descValue;
        }
      }
    }
  }

  /**
   * Populates charts for every loaded metric and training run in the selected sweep.
   * A single graph shows graph-lines for training runs present on the current page.
   * These lines correspond to the selected metric
   * 
   * @param sweepData Logs of the separate training runs executed during sweep
   * @param metricToDisplay Metric to display on the graph
   */
  function populateSweepChart(sweepData, metricToDisplay) {
    const initIndex = (currentPage - 1) * maxRunsPerPage + 1;
    sweepChart.destroy();

    // Extract only logs of the desired metric
    const relevantLogs = sweepData.map((sweepLog) => {
      return sweepLog.hasOwnProperty(metricToDisplay)? sweepLog[metricToDisplay]: [];
    });
    // Extract the maximum timestep reached for the selected metric for selected runs
    const maxXVal = Math.max(...relevantLogs.map((element) => element.length));
    // Define x-axis for the graph
    const xAxisLabels = [...Array(maxXVal).keys()];

    // Create a dataset object for each experiment for this metric (@metricToDisplay)
    let metricDatasets = relevantLogs.map((run, index) => {
      if (relevantLogs[index].length == 0) {
        return;
      }

      const experimentDesc = {
        label: `Run ${initIndex + index}`,
        data: extractProperty(run, "value"),
        borderColor: colors[index % colors.length],
        borderWidth: 1,
      };
      return experimentDesc;
    });
    metricDatasets = metricDatasets.filter((element) => element !== undefined);

    // Draw the graphs
    sweepChart = new Chart(ctx, {
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
            text: metricToDisplay,
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
                const titleRepresentation = `${metricToDisplay}: ${y_}`;
                return titleRepresentation;
              },

              // Display the time passed from the start of the experiment
              label: function (item) {
                let relativeSeconds = parseFloat(
                    sweepData[item.datasetIndex][metricToDisplay][item.dataIndex].time
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
    });
  }

  init();
});
