/**
 * This is designed to run in the browser console when logged in and
 * on a saved workbook page.  The workbook must have a table view defined,
 * and must have already been saved.
 *
 * It is recommended that you add this code as a "New snippet" in your Chrome
 * devtools console.
 * Find "Sources" in the console tab
 * Find "Snippets", under Sources
 * click the plus sign,
 * paste in this code in the window.
 * rename the snippet to something like Query Export
 * Save the snippet with ctrl+s or cmd+s
 *
 * Navigate in NetSuite under a valid role to Analytics and select a workbook
 * Right-click the snippet and click Run to export it to SuiteScript 2.1 in a new tab.
 *
 * @author Matt Dahse
 */
require(['N/query'],(query)=>{
    let href = window.location.href;
    let parts = href.split(/[\=\&\?]/);
    let wbIndex = parts.indexOf("workbook");

    if (href.indexOf("netsuite") === -1 || href.indexOf('workbook=') === -1) {
        alert("This extension only works on NetSuite workbook pages when a workbook has been saved.");
        return;
    } else {

        let id = parts[wbIndex + 1];
        const getAllMappedResults = (wb) => {
            const pageData = wb.runPaged({pageSize: 1000});
            let allResults = [];
            const allPages = [];
            pageData.iterator().each((page) => {
                let currentPage = page.value;
                allPages.push(currentPage.data);
                return true;
            });
            allPages.forEach((page) => {
                allResults = allResults.concat(page.asMappedResults());
            });
            return allResults;
        }

        /**
         * This function gets the script id of a workbook from its internalid
         * which can be extracted from the current URL.
         *
         * This is also, incidentally, an example the output of the export snippet,
         * as it was created with this tool.
         *
         * @param id
         * @returns {string}
         */
        const getWbId = (id) => {
            const root = query.create({type: "usrsavedsearch"});
            root.condition = root.createCondition({
                fieldId: "internalid",
                operator: "ANY_OF",
                values: [String(id)]
            });
            root.columns = [
                root.createColumn({
                    label: "Internal ID",
                    fieldId: "internalid",
                    alias: "INTERNAL_ID"
                }),
                root.createColumn({
                    label: "Name",
                    fieldId: "name",
                    alias: "NAME"
                }),
                root.createColumn({
                    label: "Script ID",
                    fieldId: "scriptid",
                    alias: "SCRIPT_ID"
                })
            ];
            const results = getAllMappedResults(root);
            return results[0].SCRIPT_ID.toLowerCase();
        }

        /**
         * This is the main function of the tool, which composes a readable
         * blob of code based on the workbook
         * @param wbId {string} - this is the scriptid of the workbook like "custworkbook18"
         * @returns {string}
         */
        const decomposeQuery = (wbId) => {
            let output = "";
            const wb = query.load({
                id: wbId
            });
            const indent = space(4);
            output += `const createQuery = () => {<br />${indent}`;
            output += renderRootQuery(wb);
            output += `<br />${indent}\/\/ Root level joins`;
            output += renderJoinsForComponent(wb, "root");

            /*
                Ideally, this would use a recursive function to go infinitely deep,
                but I couldn't wrap my head around how to do that, so this supports
                up to 4 levels of joins via some unholy nested loops.
             */
            for (let key in wb.child) {
                let component = wb.child[key];
                if (hasJoins(component)) {
                    const joinName = "root_" + component.type;
                    output += `<br />${indent}\/\/ Level 1 joins under ${joinName}<br \>`
                    output += renderJoinsForComponent(component, joinName);
                    for (let deepKey in component.child) {
                        let deepComponent = component.child[deepKey];
                        if (hasJoins(deepComponent)) {
                            const deepName = joinName + "_" + deepComponent.type;
                            output += `<br />${indent}\/\/ Level 2 joins under ${deepName}<br \>`
                            output += renderJoinsForComponent(deepComponent, deepName);

                            for (let deep3Key in deepComponent.child) {
                                let deep3Component = deepComponent.child[deep3Key];
                                if (hasJoins(deep3Component)) {
                                    const deep3Name = deepName + "_" + deep3Component.type;
                                    output += `<br />${indent}\/\/ Level 3 joins under ${deep3Name}<br \>`
                                    output += renderJoinsForComponent(deep3Component, deep3Name);
                                    for (let deep4Key in deep3Component.child) {
                                        let deep4Component = deep3Component.child[deep4Key];
                                        if (hasJoins(deep4Component)) {
                                            const deep4Name = deep3Name + "_" + deep3Component.type;
                                            output += `<br />${indent}\/\/ Level 4 joins under ${deep4Name}<br />`;
                                            output += renderJoinsForComponent(deep4Component, deep4Name);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            output += `<br />${indent}\/\/ Conditions: <br />`;
            if (wb.condition) {
                if (wb.condition.children) {
                    output += `${indent}root.condition = root.${wb.condition.operator.toLowerCase()}(<br />`;
                    output += renderConditions(wb);
                    output += `);`;
                } else { // only one condition
                    output += `${indent}root.condition = ${renderCondition(wb.condition, space(1))};<br />`;
                }
            }

            output += renderColumns(wb);

            output += `${indent}return root;<br />}`;

            output += `<br /><br />\/\/ Function to get all results as mapped objects:<br />`;
            /*
                For convenience, so the code can be copied into the console and results
                retrieved.
             */
            output += renderGetResultsFunction();
            output += `<br /><br />\/\/ getAllMappedResults(createQuery());`;
            return output;
        }

        /**
         * This function renders the code to create all of the columns.  Additional
         * columns are injected for list/select options to get the ids of the
         * values, so you don't have to make separate columns for the display
         * name of your values, and their ids.
         *
         * The columns are given an alias that is either based on the label you assign
         * in the UI when saving the workbook, or they are generated programmatically
         * based on the field id, or the formula type.
         *
         * Note, these aliases will get ugly, and I recommend creating labels to avoid
         * some really long aliases.
         *
         * @param wb {N/query.Query}
         * @returns {string}
         */
        const renderColumns = (wb) => {
            const indent = space(4);
            let output = `<br />${indent}\/\/ Columns: <br />`;
            output += `${indent}root.columns = [<br />`;
            let columns = [];
            const aliases = getAliasesForColumns(wb.columns);
            wb.columns.forEach((column, index) => {
                columns.push(renderColumn(column, aliases[index]));
            });
            output += columns.join(",<br />&nbsp;&nbsp;&nbsp;&nbsp;");
            output += `<br />${indent}];<br />`;
            return output;
        }

        /**
         * This function renders an individual column.
         *
         * @param col
         * @param alias
         * @param isRaw
         * @returns {string}
         */
        const renderColumn = (col, alias, isRaw) => {
            const n = space(8);
            const thisAlias = isRaw ? `${alias}_RAW` : alias;
            let needsRawColumn = false;
            let output = `${space(4)}${getComponentName(col)}.createColumn({<br />`;

            if (col.label) {
                output += `${n}label: "${col.label}",<br />`;
            }
            if (col.fieldId) {
                output += `${n}fieldId: "${col.fieldId}",<br />`;
            }
            if (col.formula) {
                output += `${n}formula: "${col.formula}",<br />`;
                output += `${n}type: "${col.type}",<br />`;
            }
            if (col.aggregate) {
                output += `${n}aggregate: "${col.aggregate}",<br />`;
            }
            if (col.groupBy) {
                output += `${n}groupBy: "${col.groupBy}",<br />`;
            }
            if (!isRaw && col.context && col.context.name === "DISPLAY") {
                output += `${n}context: {<br />${space(12)}name: "DISPLAY"<br />${n}},<br />`;
                needsRawColumn = true;
            }
            if (isRaw) {
                output += `${n}context: {<br />${space(12)}name: "RAW"<br />${n}},<br />`;
            }
            output += `${n}alias: "${thisAlias}"<br />`;
            output += `${space(4)}})`;
            if (!isRaw && needsRawColumn) {
                output += `, <br />`;
                output += renderColumn(col, alias, true);
            }

            return output;
        }

        /**
         * This function creates an array of aliases for the (original) columns of the
         * loaded workbook.  Columns that are injected to get the IDs of select values
         * will have a _RAW suffix.
         *
         * This function works hard to avoid duplicate aliases, but please do yourself
         * a favor and give your columns unique labels in the UI when saving the workbook
         * (NOT the dataset, the workbook!).
         *
         * @param columns
         * @returns {*}
         */
        const getAliasesForColumns = (columns) => {
            const aliases = columns.map((column) => {

                if (column.label) {
                    return column.label.toUpperCase().replace(/\s/g, "_");
                }
                // If no label, try and fall back to the field id
                if (column.fieldId) {
                    return column.fieldId.toUpperCase();
                }
                // If no field id, this is a formula - compose something from its type
                return `FORMULA_${column.type}`;
            });

            // Now ensure uniqueness of each member in the array
            for (let i = 0; i < aliases.length; i++) {
                let firstIndex = aliases.indexOf(aliases[i]);
                if (firstIndex < i && !columns[i].formula) {
                    aliases[firstIndex] = getComponentName(columns[firstIndex]).toUpperCase() + "_" + aliases[firstIndex];
                    aliases[i] = getComponentName(columns[i]).toUpperCase() + "_" + aliases[i];
                } else if (firstIndex < i) { // duplicate formula
                    let count = 0;
                    let j = firstIndex;
                    while (j <= i) {
                        if (aliases[j] === aliases[i]) {
                            count++;
                            aliases[j] += `_${count}`;
                        }
                        j++;
                    }
                }
            }
            return aliases;
        }

        /**
         * This function goes digging in an object's parentage to compose
         * a name that takes it back to the root.  This name is the variable
         * name assigned to the join that created this condition or column.
         *
         * Columns and Conditions of the main query are from "root" which is
         * the variable name of that object.
         *
         * @param obj
         * @returns {string}
         */
        const getComponentName = (obj) => {
            if (!obj.component) {
                return obj.operator || "Unknown";
            }
            let parent = obj.component.parent;
            if (!parent) {
                return "root";
            }
            let name = [obj.component.type];
            while (parent) {
                if (parent.parent) { // don't add the root type to the name
                    name.unshift(parent.type);
                }
                parent = parent.parent;
            }
            return name.join("_");
        }

        /**
         * This function starts the party.
         *
         * @param wb
         * @returns {string}
         */
        const renderRootQuery = (wb) => {
            let output = `${space(4)}const root = query.create({ type: "${wb.type}"});<br />`;
            return output;
        }

        /**
         * This function renders a condition group, which is to say, a list of conditions
         * within a single logical operator (and, or, not), and it calls itself
         * recursively to render deeper groups (an "or" within an "and", etc)
         *
         * @param group
         * @param startingIndent
         * @param operator
         * @returns {*}
         */
        const renderConditionGroup = (group, startingIndent, operator) => {
            let n = startingIndent + space(4);
            let conditions = group.map((condition) => {
                let text = renderCondition(condition, n);
                if (["and", "or", "not"].indexOf(text) > -1) {
                    let groupText = `${n}root.${text}(<br />`;
                    groupText += renderConditionGroup(condition.children, n + space(4), text) + `<br />${n}),<br />`;
                    return groupText;
                }
                return text;
            });
            let allConditions = conditions.join(",<br />");
            allConditions = allConditions.replace(/,<br \/>,<br \/>/g,",<br />");
            return allConditions;
        }

        /**
         * This is the top level function that gets the condition groups, if any, or
         * renders the single condition, if there is only one.
         * @param wb
         * @param startingIndent
         * @returns {string|string|*}
         */
        const renderConditions = (wb, startingIndent) => {

            let indent = startingIndent || space(8);
            if (wb.condition.children) {
                return renderConditionGroup(wb.condition.children, indent, wb.condition.operator.toLowerCase());
            } else if (["AND", "NOT", "OR"].indexOf(wb.condition.operator) == -1) {
                return renderCondition(wb.condition, space(8));
            }
        }

        /**
         * This is a bottom level function that makes a condition appear pretty on the
         * page
         *
         * @param condition {N/query.Condition}
         * @param n {string} A number of non-breaking space html entities representing the indent level
         */
        const renderCondition = (condition, n) => {
            const componentName = getComponentName(condition);
            if (["AND", "OR", "NOT"].indexOf(componentName) > -1) {
                return componentName.toLowerCase();
            }
            let output = `${n}${componentName}.createCondition({<br />`;
            if (condition.fieldId) {
                output += `${n + space(4)}fieldId: "${condition.fieldId}",<br />`;
            }
            if (condition.formula) {
                output += `${n + space(4)}formula: "${condition.formula}",<br />`;
            }
            if (condition.type) {
                output += `${n + space(4)}type: "${condition.type}",<br />`;
            }
            if (condition.aggregate) {
                output += `${n + space(4)}aggregate: "${condition.aggregate}",<br />`;
            }
            output += `${n + space(4)}operator: "${condition.operator}",<br />`;
            output += `${n + space(4)}values: ${JSON.stringify(condition.values)}<br />`;

            output += `${n + space(4)}})`;
            return output;
        }

        /**
         * A simple function to determine if a component has any joins under it.
         *
         * @param component
         * @returns {boolean}
         */
        const hasJoins = (component) => {
            const numChildren = Object.keys(component.child).length;
            return Boolean(numChildren);
        }

        /**
         * This function writes the code that renders the joins that are attached
         * to (created from) a component.
         *
         * I've found the autoJoin() behavior to be a little cryptic, and I've opted for
         * joinFrom and joinTo in favor of the more generic wrapper for consistency
         * and reliability.
         *
         * @param component
         * @param parentName
         * @returns {string}
         */
        const renderJoinsForComponent = (component, parentName) => {
            if (!hasJoins(component)) {
                return ``;
            }
            let keys = Object.keys(component.child);
            let output = ``;
            keys.forEach((join) => {
                output += renderJoin(component, join, parentName);
            });
            return output;
        }

        /**
         * This function renders a joinTo, where the joined component is linked via
         * a field on the parent.
         *
         * @param wb
         * @param key
         * @param parentName
         * @returns {string}
         */
        const renderJoinTo = (wb, key, parentName) => {
            let output = ``;
            const type = wb.child[key].type;
            const name = parentName !== "root" ? `${parentName}_${type}` : `${type}`;
            output += `<br />${space(4)}const ${name.replace("root_", "")} = ${parentName.replace("root_", "")}.joinTo({<br />
            ${space(12)}fieldId: "${type}",<br />
            ${space(12)}target: "${wb.child[key].target}"<br />${space(4)}
            });<br />`;
            return output;
        }

        /**
         * This function renders a joinFrom, where the joined component is linked via
         * a field on the target record.
         * @param wb
         * @param key
         * @param parentName
         * @returns {string}
         */
        const renderJoinFrom = (wb, key, parentName) => {
            let output = ``;
            const type = wb.child[key].type;
            const name = parentName !== "root" ? `${parentName}_${type}` : `${type}`;
            output += `<br />${space(4)}const ${name.replace("root_", "")} = ${parentName.replace("root_", "")}.joinFrom({<br />
            ${space(12)}fieldId: "${type}"<br />
            ${space(12)}source: "${wb.child[key].source}"<br />${space(4)}
            });<br />`;
            return output;
        }

        /**
         * This function decides whether to render a joinTo or a joinFrom based on whether
         * the join has a target or a source.
         *
         * @param wb
         * @param key
         * @param parentName
         * @returns {string}
         */
        const renderJoin = (wb, key, parentName) => {
            let join = wb.child[key];
            if (join.source) {
                return renderJoinFrom(wb, key, parentName);
            }
            if (join.target) {
                return renderJoinTo(wb, key, parentName);
            }
            let output = ``;
            const type = wb.child[key].type;
            const name = parentName !== "root" ? `${parentName}_${type}` : `${type}`;
            output += `<br />${space(4)}const ${name.replace("root_", "")} = ${parentName.replace("root_", "")}.autoJoin({<br />
            ${space(12)}fieldId: "${type}"<br />${space(4)}
            });<br />`;
            return output;
        }

        /**
         * This function assists in displaying the rendered code with indents, adding
         * a specified number of non-breaking space html entities to the output where
         * called.
         *
         * @param n
         * @returns {string}
         */
        const space = (n) => {
            let output = "";
            for (let i = 0; i < n; i++) {
                output += "&nbsp;";
            }
            return output;
        }

        /**
         * This function creates the code for a handy query utility function to get
         * all results of a given query as mapped results.
         *
         * The resulting function is actually called at the top of this file, which
         * is pretty meta when you think about it.
         *
         * @returns {string}
         */
        const renderGetResultsFunction = () => {
            return `const getAllMappedResults = (wb) => {<br />
            ${space(4)}const pageData = wb.runPaged({pageSize: 1000});<br />
            ${space(4)}let allResults = [];<br />
            ${space(4)}const allPages = [];<br />
            ${space(4)}pageData.iterator().each((page)=>{<br />
            ${space(8)}    let currentPage = page.value;<br />
            ${space(8)}    allPages.push(currentPage.data);<br />
            ${space(8)}    return true;<br />
            ${space(4)}});<br />
            ${space(4)}allPages.forEach((page) => {<br />
            ${space(8)}    allResults = allResults.concat(page.asMappedResults());<br />
            ${space(4)}});<br />
            ${space(4)}return allResults;<br />
             }<br />`
        }

        // This is the code that is called in the console when the snippet is run.
        let workbookId = getWbId(id);
        let html = decomposeQuery(workbookId);
        const popup = window.open("", "_blank");
        popup.document.body.innerHTML = html;
    }
});

