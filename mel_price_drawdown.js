document.addEventListener("DOMContentLoaded", async function () {
    // Display the loading indicator
    const loadingIndicator = document.getElementById("loading");
    loadingIndicator.style.display = "block";

    let setLocationCategory = "Netmiss";

    let setBaseUrl = null;
    if (cda === "internal") {
        setBaseUrl = `https://wm.${office.toLowerCase()}.ds.usace.army.mil/${office.toLowerCase()}-data/`;
    } else if (cda === "public") {
        setBaseUrl = `https://cwms-data.usace.army.mil/cwms-data/`;
    }
    console.log("setBaseUrl: ", setBaseUrl);

    const apiUrl = setBaseUrl + `location/group?office=${office}&group-office-id=${office}&category-office-id=${office}&category-id=${setLocationCategory}`;
    console.log("apiUrl: ", apiUrl);

    const netmissTsidMap = new Map();
    const metadataMap = new Map();

    const metadataPromises = [];
    const netmissTsidPromises = [];

    // Get current date and time
    const currentDateTime = new Date();
    // console.log('currentDateTime:', currentDateTime);

    // Subtract thirty hours from current date and time
    const currentDateTimeMinus30Hours = subtractHoursFromDate(currentDateTime, 30);
    console.log('currentDateTimeMinus30Hours :', currentDateTimeMinus30Hours);

    // Subtract thirty hours from current date and time
    const currentDateTimeMinus00Hours = subtractHoursFromDate(currentDateTime, 0);
    console.log('currentDateTimeMinus00Hours :', currentDateTimeMinus00Hours);

    const currentDateTimePlus190Hours = addHoursFromDate(currentDateTime, 190);
    console.log('currentDateTimePlus190Hours :', currentDateTimePlus190Hours);

    fetch(apiUrl)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then((data) => {
            if (!Array.isArray(data) || data.length === 0) {
                console.warn("No data available from the initial fetch.");
                return;
            }

            const targetCategory = { "office-id": office, id: setLocationCategory };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map((item) => item.id);
            if (basins.length === 0) {
                console.warn("No basins found for the given setLocationCategory.");
                return;
            }

            const apiPromises = [];
            let combinedData = [];

            basins.forEach((basin) => {
                const basinApiUrl = setBaseUrl + `location/group/${basin}?office=${office}&category-id=${setLocationCategory}`;
                console.log("basinApiUrl: ", basinApiUrl);

                apiPromises.push(
                    fetch(basinApiUrl)
                        .then((response) => {
                            if (!response.ok) {
                                throw new Error(
                                    `Network response was not ok for basin ${basin}: ${response.statusText}`
                                );
                            }
                            return response.json();
                        })
                        .then((basinData) => {
                            // console.log('basinData:', basinData);

                            if (!basinData) {
                                console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            basinData[`assigned-locations`] = basinData[
                                `assigned-locations`
                            ].filter((location) => location.attribute <= 900);
                            basinData[`assigned-locations`].sort(
                                (a, b) => a.attribute - b.attribute
                            );

                            combinedData.push(basinData);

                            if (basinData["assigned-locations"]) {
                                basinData["assigned-locations"].forEach((loc) => {
                                    let netmissTsidApiUrl = setBaseUrl + `timeseries/group/Stage?office=${office}&category-id=${loc["location-id"]}`;
                                    if (netmissTsidApiUrl) {
                                        netmissTsidPromises.push(
                                            fetch(netmissTsidApiUrl)
                                                .then((response) => {
                                                    if (response.status === 404) {
                                                        return null; // Skip processing if no data is found
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(
                                                            `Network response was not ok: ${response.statusText}`
                                                        );
                                                    }
                                                    return response.json();
                                                })
                                                .then((netmissTsidData) => {
                                                    // console.log('netmissTsidData:', netmissTsidData);

                                                    // Extract the dynamic part from time-series-category
                                                    let dynamicId = netmissTsidData["time-series-category"]["id"];

                                                    // Create the new timeseries-ids dynamically
                                                    let newTimeseriesId = null;

                                                    // console.log(loc["location-id"]);

                                                    if (dynamicId === "Mel Price Pool-Mississippi") {
                                                        newTimeseriesId = `${dynamicId}.Elev.Inst.~1Day.0.netmiss-fcst`;
                                                    } else {
                                                        newTimeseriesId = `${dynamicId}.Stage.Inst.~1Day.0.netmiss-fcst`;
                                                    }
                                                    // New object to append for the first timeseries-id
                                                    let newAssignedTimeSeries = {
                                                        "office-id": "MVS",
                                                        "timeseries-id": newTimeseriesId, // Use dynamic timeseries-id
                                                        "ts-code": null,
                                                        attribute: 2,
                                                    };

                                                    // Append both new objects to assigned-time-series
                                                    netmissTsidData["assigned-time-series"].push(
                                                        newAssignedTimeSeries
                                                    );

                                                    // console.log("netmissTsidData: ", netmissTsidData);

                                                    if (netmissTsidData) {
                                                        netmissTsidMap.set(loc["location-id"], netmissTsidData);
                                                    }
                                                })
                                                .catch((error) => {
                                                    console.error(
                                                        `Problem with the fetch operation for stage TSID data at ${netmissTsidApiUrl}:`,
                                                        error
                                                    );
                                                })
                                        );
                                    } else {
                                    }

                                    // Construct the URL for the location metadata request
                                    let locApiUrl = setBaseUrl + `locations/${loc["location-id"]}?office=${office}`;
                                    if (locApiUrl) {
                                        // Push the fetch promise to the metadataPromises array
                                        metadataPromises.push(
                                            fetch(locApiUrl)
                                                .then((response) => {
                                                    if (response.status === 404) {
                                                        console.warn(
                                                            `Location metadata not found for location: ${loc["location-id"]}`
                                                        );
                                                        return null; // Skip processing if no metadata is found
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(
                                                            `Network response was not ok: ${response.statusText}`
                                                        );
                                                    }
                                                    return response.json();
                                                })
                                                .then((locData) => {
                                                    if (locData) {
                                                        metadataMap.set(loc["location-id"], locData);
                                                    }
                                                })
                                                .catch((error) => {
                                                    console.error(
                                                        `Problem with the fetch operation for location ${loc["location-id"]}:`,
                                                        error
                                                    );
                                                })
                                        );
                                    }

                                });
                            }
                        })
                        .catch((error) => {
                            console.error(
                                `Problem with the fetch operation for basin ${basin}:`,
                                error
                            );
                        })
                );
            });

            Promise.all(apiPromises)
                .then(() => Promise.all(netmissTsidPromises))
                .then(() => {
                    combinedData.forEach((basinData) => {
                        if (basinData["assigned-locations"]) {
                            basinData["assigned-locations"].forEach((loc) => {
                                const netmissTsidMapData = netmissTsidMap.get(
                                    loc["location-id"]
                                );
                                // console.log('netmissTsidMapData:', netmissTsidMapData);

                                reorderByAttribute(netmissTsidMapData);
                                if (netmissTsidMapData) {
                                    loc["tsid-netmiss"] = netmissTsidMapData;
                                }

                                const metadataMapData = metadataMap.get(loc["location-id"]);
                                if (metadataMapData) {
                                    loc["metadata"] = metadataMapData;
                                }
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);
                })
                .then(() => {
                    // Append NWS 5 digits codes
                    combinedData.forEach((dataObj, index) => {
                        // Ensure 'assigned-locations' exists and is an array
                        if (Array.isArray(dataObj["assigned-locations"])) {
                            // Iterate through the assigned locations
                            dataObj["assigned-locations"].forEach((location) => {
                                // Check if the location-id matches 'Cape Girardeau-Mississippi'
                                if (location["location-id"] === "Cape Girardeau-Mississippi") {
                                    location["NWS"] = "CPGM7";
                                } else if (
                                    location["location-id"] === "LD 24 TW-Mississippi" ||
                                    location["location-id"] === "LD 24 Pool-Mississippi"
                                ) {
                                    location["NWS"] = "CLKM7";
                                } else if (
                                    location["location-id"] === "LD 25 TW-Mississippi" ||
                                    location["location-id"] === "LD 25 Pool-Mississippi"
                                ) {
                                    location["NWS"] = "CAGM7";
                                } else if (
                                    location["location-id"] === "Mel Price TW-Mississippi" ||
                                    location["location-id"] === "Mel Price Pool-Mississippi"
                                ) {
                                    location["NWS"] = "ALNI2";
                                } else if (location["location-id"] === "St Louis-Mississippi") {
                                    location["NWS"] = "EADM7";
                                } else if (location["location-id"] === "Chester-Mississippi") {
                                    location["NWS"] = "CHSI2";
                                } else if (
                                    location["location-id"] === "Cape Girardeau-Mississippi"
                                ) {
                                    location["NWS"] = "CPGM7";
                                } else {
                                    location["NWS"] = "Your default string here"; // Optionally, assign a default value for other locations
                                }
                            });
                        } else {
                            console.warn(
                                `Skipping dataObj at index ${index} as 'assigned-locations' is not a valid array.`
                            );
                        }
                    });
                    console.log("combinedData with NWS Code: ", combinedData);

                    combinedData = combinedData
                        .map(group => {
                            const filteredLocations = group['assigned-locations'].filter(loc =>
                                ['Mel Price Pool-Mississippi', 'Mel Price TW-Mississippi'].includes(loc['location-id'])
                            );

                            if (filteredLocations.length > 0) {
                                return {
                                    ...group,
                                    'assigned-locations': filteredLocations
                                };
                            }

                            return null;
                        })
                        .filter(Boolean);

                    console.log("combinedData with NWS Code filter for Mel Price: ", combinedData);

                    // Append the table to the specified container
                    const container = document.getElementById("table_container");
                    const table = createParagraphs(combinedData);
                    container.appendChild(table);

                    // loadingIndicator.style.display = "none";
                })
                .catch((error) => {
                    console.error(
                        "There was a problem with one or more fetch operations:",
                        error
                    );
                    // loadingIndicator.style.display = "none";
                });
        })
        .catch((error) => {
            console.error(
                "There was a problem with the initial fetch operation:",
                error
            );
            // loadingIndicator.style.display = "none";
        });

    function filterByLocationCategory(array, setLocationCategory) {
        return array.filter(
            (item) =>
                item["location-category"] &&
                item["location-category"]["office-id"] === setLocationCategory["office-id"] &&
                item["location-category"]["id"] === setLocationCategory["id"]
        );
    }

    function subtractHoursFromDate(date, hoursToSubtract) {
        return new Date(date.getTime() - hoursToSubtract * 60 * 60 * 1000);
    }

    function addHoursFromDate(date, hoursToSubtract) {
        return new Date(date.getTime() + hoursToSubtract * 60 * 60 * 1000);
    }

    const reorderByAttribute = (data) => {
        data["assigned-time-series"].sort((a, b) => a.attribute - b.attribute);
    };

    async function createParagraphs(data) {
        // Replace this with the ID or class of the container where paragraphs should go
        const container = document.getElementById("paragraphs_container"); // or use querySelector for other selectors

        console.log("data: ", data);

        // const paragraphsData = [];

        // Retry wrapper
        async function fetchWithRetry(url, retries = 40, delay = 1000) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                    return await response.json();
                } catch (err) {
                    console.warn(`Fetch failed (${i + 1}/${retries}): ${url}`);
                    if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
                    else throw err;
                }
            }
        }

        // Fetch data and push it into `data`
        async function fetchAllDataAndUpdate(data) {
            for (const entry of data) {
                for (const location of entry["assigned-locations"]) {
                    try {
                        const stageTsid = location["tsid-netmiss"]["assigned-time-series"][0]["timeseries-id"];
                        const netmissTsid = location["tsid-netmiss"]["assigned-time-series"][1]["timeseries-id"];

                        const stageApiUrl = `${setBaseUrl}timeseries?name=${stageTsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTimeMinus00Hours.toISOString()}&office=${office}`;
                        const netmissApiUrl = `${setBaseUrl}timeseries?name=${netmissTsid}&begin=${currentDateTimeMinus00Hours.toISOString()}&end=${currentDateTimePlus190Hours.toISOString()}&office=${office}`;

                        const [stageData, netmissData] = await Promise.all([
                            fetchWithRetry(stageApiUrl),
                            fetchWithRetry(netmissApiUrl),
                        ]);

                        // Push the fetched data into the location
                        location["fetched-stage-data"] = stageData;
                        location["fetched-netmiss-data"] = netmissData;
                    } catch (error) {
                        console.error("Final fetch failure for location:", location, error);
                        location["fetched-stage-data"] = null;
                        location["fetched-netmiss-data"] = null;
                    }
                }
            }

            console.log("✅ All data fetched and updated:", data);
        }

        await fetchAllDataAndUpdate(data);

        console.log("data after fetch time series: ", data);

        loadingIndicator.style.display = "none";

        let stageText = "";
        let netmissText = "";

        for (const entry of data) {
            for (const location of entry["assigned-locations"]) {

                const locationId = location["location-id"];
                console.log("locationId: ", locationId);

                const publicName = location["metadata"]?.["public-name"];
                console.log("publicName: ", publicName);

                const nws = location["NWS"];
                console.log("NWS: ", nws);

                const formattedStageData = location["fetched-stage-data"]?.values?.map(entry => {
                    const timestamp = Number(entry[0]); // Ensure timestamp is a number

                    return {
                        ...entry, // Retain other data
                        formattedTimestampUTC: convertUnixTimestamp(timestamp, false),  // UTC time
                        formattedTimestampCST: convertUnixTimestamp(timestamp, true)    // CST/CDT adjusted time
                    };
                }) || []; // Default to an empty array if the data is undefined

                // Now you have formatted data for both datasets, or an empty array if the data is missing
                console.log("Formatted location[`fetched-stage-data`]:", formattedStageData);

                const stageValueTemp = get6AMReadings(formattedStageData);
                console.log("stageValueTemp: ", stageValueTemp);

                stageValue = stageValueTemp[0][1].toFixed(1);
                console.log("stageValue: ", stageValue);

                const stageTime = convertTimestampToDateString(stageValueTemp[0].formattedTimestampCST);
                console.log("stageTime: ", stageTime);

                const logTheLocation = ``;

                // Create a span element and append the data
                const span = document.createElement("span");

                if (locationId === "Mel Price Pool-Mississippi") {
                    span.innerHTML = `This morning: <br> ${stageTime}, ${stageValue} (ft) ${logTheLocation}`;
                    stageText = `This morning:\n ${stageTime}, ${stageValue} (ft) ${logTheLocation}`;
                    // paragraphsData.push(stageText);
                }
                // Append the span to the container
                container.appendChild(span);

                // Create a line break and append it after the span
                const lineBreak = document.createElement("br");
                container.appendChild(lineBreak);

                let paragraphText = "";
                paragraphText = `This morning: ${locationId} ${stageTime} =  ${stageValue} (ft) ${logTheLocation}`;

                // paragraphsData.push(paragraphText);
            }
        }

        // Create a line break and append it after the span
        const lineBreak = document.createElement("br");
        container.appendChild(lineBreak);

        // Add a blank line after the first loop
        // paragraphsData.push(""); // This blank line will be added after the stageData loop

        for (const entry of data) {
            for (const location of entry["assigned-locations"]) {

                const locationId = location["location-id"];
                console.log("locationId: ", locationId);

                const nws = location["NWS"];
                console.log("NWS: ", nws);

                const formattedNetmissData = location["fetched-netmiss-data"]?.values?.map(entry => {
                    const timestamp = Number(entry[0]); // Ensure timestamp is a number

                    return {
                        ...entry, // Retain other data
                        formattedTimestampUTC: convertUnixTimestamp(timestamp, false),  // UTC time
                        formattedTimestampCST: convertUnixTimestamp(timestamp, true)    // CST/CDT adjusted time
                    };
                }) || []; // Default to an empty array if the data is undefined

                // Now you have formatted data for both datasets, or an empty array if the data is missing
                console.log("Formatted location[`fetched-netmiss-data`]:", formattedNetmissData);


                // Add your logic here for each 'location'
                const logTheLocation = ``;

                // Create a span element and append the data
                const span = document.createElement("span");

                if (locationId === "Mel Price Pool-Mississippi") {
                    span.innerHTML = "Next 5 days (subject to change due to everchanging conditions): ";
                    netmissText += `Next 5 days (subject to change due to everchanging conditions): `;

                    span.innerHTML += "<br>";
                    netmissText += "<br>";

                    for (let i = 0; i < 5; i++) {
                        const forecastTime = convertTimestampToDateString(formattedNetmissData[i].formattedTimestampCST);
                        const forecastValue = parseFloat(formattedNetmissData[i]["1"]).toFixed(2);
                        console.log(`Forecast ${i + 1}:`, forecastTime, forecastValue);

                        span.innerHTML += `${forecastTime}, ${forecastValue} (ft) ${logTheLocation}<br>`;
                        netmissText += `${forecastTime}, ${forecastValue} (ft) ${logTheLocation}<br>`;
                    }
                }

                // Append the span to the container
                container.appendChild(span);


                // Create a line break and append it after the span
                const lineBreak = document.createElement("br");
                container.appendChild(lineBreak);

                if (locationId === "Mel Price Pool-Mississippi") {
                    console.log("netmissText: ", netmissText);
                    // paragraphsData.push(netmissText);

                    prepareEmail(stageText, netmissText);
                }

            }
        }

        // console.log("paragraphsData: ", paragraphsData);

        loadingIndicator.style.display = "none";

        return container;
    }

    function convertUnixTimestamp(timestamp, toCST = false) {
        if (typeof timestamp !== "number") {
            console.error("Invalid timestamp:", timestamp);
            return "Invalid Date";
        }

        const dateUTC = new Date(timestamp); // Convert milliseconds to Date object
        if (isNaN(dateUTC.getTime())) {
            console.error("Invalid date conversion:", timestamp);
            return "Invalid Date";
        }

        if (!toCST) {
            return dateUTC.toISOString(); // Return UTC time
        }

        // Convert to CST/CDT (America/Chicago) while adjusting for daylight saving time
        const options = { timeZone: "America/Chicago", hour12: false };
        const cstDateString = dateUTC.toLocaleString("en-US", options);
        const cstDate = new Date(cstDateString + " UTC"); // Convert back to Date

        return cstDate.toISOString();
    }

    function convertTimestampToDateString(timestamp) {
        const [datePart, timePart] = timestamp.split('T');
        const [year, month, day] = datePart.split('-');
        const [hour, minute] = timePart.split(':');

        return `${month}/${day}/${year} ${hour}:${minute}`;
    }

    function get6AMReadings(data) {
        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0)); // Start of today (00:00:00)
        const todayEnd = new Date(today.setHours(23, 59, 59, 999)); // End of today (23:59:59)

        return data.filter(item => {
            const itemTimestamp = new Date(item.formattedTimestampCST);

            // Check if the timestamp is today, the hour is 6 AM, and the timestamp is not earlier than 00:00:00 UTC
            return itemTimestamp >= todayStart && itemTimestamp <= todayEnd &&
                itemTimestamp.getUTCHours() === 6 && itemTimestamp.getUTCMinutes() === 0;
        });
    }

    function prepareEmail(stageText, netmissText) {
        // Get current date in MM/DD/YYYY format
        const currentDate = new Date();
        const options = { month: '2-digit', day: '2-digit', year: 'numeric' };
        const formattedDate = currentDate.toLocaleDateString('en-US', options);
    
        // Create the email subject
        const subject = `Melvin Price L&D Drawdown Alert`;
    
        // Combine stageText and netmissText, then convert <br> to line breaks for mailto
        const combinedHtml = `${stageText}<br><br>${netmissText}`;
        const plainTextBody = combinedHtml.replace(/<br\s*\/?>/gi, '\r\n');
    
        // Define all emails as BCC
        const bcc = [
            'dll-cemvs-water-managers@usace.army.mil',
            'dll-cemvs-pa@usace.army.mil',
            'andrew.c.schimpf@usace.army.mil',
            'bernard.heroff@adm.com',
            'cheatoc@gmail.com',
            'dustin.hanson@adm.com',
            'editor@rivercountynews.com',
            'eades473@msn.com',
            'eturbinemike@aol.com',
            'gbrown@altonmarina.com',
            'graftonriveradventures@gmail.com',
            'jbutler@altonmarina.com',
            'max5032000@yahoo.com',
            'mikerodgers@carrolltonbanking.com',
            'oneofallen@yahoo.com',
            'rhonke@altonmarina.com',
            'riverbill@prodigy.net',
            'sarba64076@aol.com',
            'sarah.b.miller@usace.army.mil',
            'susanefill@yahoo.com',
            'thelongshotmarina@gmail.com'
        ].join(';');
        
        // Construct the mailto link with empty to/cc and all emails in bcc
        const mailtoLink = `mailto:`
            + `?bcc=${encodeURIComponent(bcc)}`
            + `&subject=${encodeURIComponent(subject)}`
            + `&body=${encodeURIComponent(plainTextBody)}`;
    
        // Open the mailto link in the default email client
        window.location.href = mailtoLink;
    }       
});
