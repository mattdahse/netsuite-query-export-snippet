/**
 * This snippet is designed to run in the Chrome (or similar) browser console, while
 * the user is on a dataset page - the dataset should be saved and should not be a
 * premade template.
 * @type {string}
 */
require(['N/query', 'N/dataset'], (query, dataset) => {

    let datasetName = document.getElementsByTagName("h2")[1].innerText;
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
     * This function helps to trim trailing commas where properties or members
     * are added to a parent object.
     *
     * @param str
     * @returns {*}
     */
    const trimComma = (str) => {
        return str.replace(/,<br \/>$/, "<br />");
    }

    /**
     * Given a dataset name, find the first match in the dataset list that has
     * a give name and return its scriptId so it can be loaded.
     *
     * @param name
     * @returns {*}
     */
    const getDatasetId = (name) => {
        const pageData = dataset.listPaged();
        let allResults = [];

        pageData.pageRanges.forEach((range, i)=>{
            allResults = allResults.concat(pageData.fetch(i).data);
        });

        for (let i = 0; i < allResults.length; i++) {
            if (allResults[i].name.replace(/\s/g, "") === name.replace(/\s/g, "")) {
                return allResults[i].id;
            }
        }
        alert ("Cannot find dataset.  Are you on a dataset page and have you saved the dataset yet?");
    }

    /**
     * This function gets the joins within a column.  In a dataset, all joins are defined as
     * part of a column object.  Column objects are not only the results shown when a dataset is
     * run, but also form an essential part of the conditions for a dataset.
     *
     * @param col
     * @param joins
     */
    const getJoinsForColumn = (col, joins) => {
        const joinList = [];
        if (col.join) {
            let currentJoin = col.join;
            while(currentJoin) {
                joinList.push(currentJoin);
                currentJoin = currentJoin.join;
            }
        }
        let names = [];
        for (let i = joinList.length -1; i > -1; i--) {
            let thisName = joinList[i].fieldId.replace(joinList[i].fieldId[0], joinList[i].fieldId[0].toUpperCase());
            names.push(thisName);
            let fullName = names.join("");
            fullName = fullName.replace(fullName[0], fullName[0].toLowerCase());
            joins[fullName] = joinList[i];
        }
    }

    /**
     * This function adds to the joins object.  Since conditions can have children
     * which also have joins, this function is called recursively to get to the bottom
     * of the rabbit hole.
     *
     * @param condition
     * @param joins
     */
    const getJoinsForCondition = (condition, joins) => {
        if (condition.column) {
            getJoinsForColumn(condition.column, joins);
        } else if (condition.children) {
            condition.children.forEach((child)=>{
                getJoinsForCondition(child, joins)
            });
        }
    }

    /**
     * This is a top level function to compose a joins object which
     * has joins from the (result) columns and from the condition columns.
     * It is expect that some of these joins are going to be reused between
     *
     * @param dSet
     * @returns {{}}
     */
    const getJoins = (dSet) => {
        const joins = {};
        dSet.columns.forEach((col)=>{
            getJoinsForColumn(col, joins);
        });
        getJoinsForCondition(dSet.condition, joins);

        return joins;
    }

    /**
     * This function determines if two join objects are in fact equivalent, allowing
     * for re-use of the joins between columns and conditions.
     *
     * @param a
     * @param b
     * @returns {*|boolean}
     */
    const joinsAreEqual = (a, b) => {
        if (a.fieldId !== b.fieldId) {
            return false;
        }
        if (a.source !== b.source) {
            return false;
        }
        if (a.target !== b.target) {
            return false;
        }
        if (!a.join && !b.join) {
            return true;
        }
        if (Boolean(a.join) !== Boolean(b.join)) {
            return false; // only one join has a child
        }
        return joinsAreEqual(a.join, b.join);
    }

    /**
     * This function tries to match a join in a column to a join
     * that is already defined in the joins object.
     *
     * @param column
     * @param joins
     * @returns {string|null}
     */
    const findJoinNameForColumn = (column, joins) => {
        if (!column.join) {
            return null;
        }
        for (let joinName in joins) {
            if (joinsAreEqual(column.join, joins[joinName])) {
                return joinName
            }
        }
        return "Not found";
    }

    /**
     * This function matches a given join object to an existing
     * object defined in the joins list.
     *
     * @param join
     * @param joins
     * @returns {string}
     */
    const findJoinNameForJoin = (join, joins) => {
        for (let joinName in joins) {
            if (joinsAreEqual(join, joins[joinName])) {
                return joinName
            }
        }
        return "Not found";
    }

    /**
     * This function composes html to define a joins object.
     *
     * @param ds
     * @param joins
     * @param indent
     * @returns {string}
     */
    const renderJoins = (ds, joins, indent) => {
        let joinNames = Object.keys(joins)
        let html = `<br />
        ${indent}\/\/Joins<br />${indent}const joins = {};<br />`;
        let joinsHtml = []
        let jIndent = indent + space(4);
        joinNames.forEach((name)=> {
            joinsHtml.push(renderJoin(joins[name], joins, jIndent));
        });
        html += joinsHtml.join("") + "<br />";
        return html;
    }

    /**
     * This function composes the html to render a join object (within the larger joins object)
     *
     * @param join
     * @param joins
     * @param indent
     * @returns {string}
     */
    const renderJoin = (join, joins, indent) => {
        let html = `${indent}joins["${findJoinNameForJoin(join, joins)}"] = dataset.createJoin({<br />`;
        let fSpace = indent + space(4);
        let properties = ['fieldId', 'source', 'target'];
        properties.forEach((prop)=>{
            if(join[prop]) {
                html += `${fSpace}${prop}: "${join[prop]}",<br />`;
            }
        });
        if (join.join) {
            html += `${fSpace}join: joins["${findJoinNameForJoin(join.join, joins)}"]<br />`
        }
        html += `${indent}});<br />`;
        return html;
    }

    /**
     * This function gets the name for a column - which is to say the name that is the property
     * for this column in the "columns" object we are creating to collect all columns.
     *
     * @param col
     * @param joins
     * @param columns
     * @returns {*|string}
     */
    const getNameForColumn = (col, joins, columns) => {
        let fieldId = col.fieldId;
        if (col.formula) {
            let formulasOfType = 0;
            fieldId = `formula${col.type}_${formulasOfType}`;
            while (columns[fieldId.toUpperCase()] && columns[fieldId.toUpperCase()].formula !== col.formula) {
                formulasOfType++;
                fieldId = `formula${col.type}_${formulasOfType}`;
            }
        }
        let name = fieldId;
        if (col.join) {
            fieldId = fieldId.replace(fieldId[0], fieldId[0].toUpperCase());
            name = findJoinNameForColumn(col, joins) + fieldId;
        }
        col.newAlias = name.toUpperCase();
        return col.newAlias;
    }

    /**
     * This function gets the columns in the dataset and  returns an object with
     * column names
     * @param ds
     * @param joins
     * @returns {{}}
     */
    const getColumns = (ds, joins) => {
        const columns = {};
        ds.columns.forEach((col)=>{
            let colName = getNameForColumn(col, joins, columns);
            col.colName = colName;
            columns[colName] = col;
        });
        getColumnForCondition(ds.condition, joins, columns);
        return columns;
    }

    /**
     * This function will drill into a condition and its descendents to get the columns
     * associated for each.
     *
     * @param condition
     * @param joins
     * @param columns
     */
    const getColumnForCondition = (condition, joins, columns)=>{
        if (condition.column) {
            let colName = getNameForColumn(condition.column, joins, columns);
            condition.column.colName = colName;
            columns[colName] = condition.column;
        } else if (condition.children.length) {
            condition.children.forEach((cond)=>{
                getColumnForCondition(cond, joins, columns);
            });
        }
    }

    /**
     * This function creates an array of aliases for the (original) columns of the
     * loaded dataset.
     *
     * This function works hard to avoid duplicate aliases, but please do yourself
     * a favor and give your columns unique labels in the UI when saving the workbook
     *
     * @param columns
     * @returns {*}
     */
    const getAliasesForColumns = (columns, joins) => {

        const aliases = columns.map((column) => {

            if (column.label) {
                return column.label.toUpperCase().replace(/[^\w]/g, "_");
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
            if (firstIndex < i) {
                aliases[firstIndex] = getNameForColumn(columns[firstIndex],joins, columns).toUpperCase();
                aliases[i] = getNameForColumn(columns[i], joins, columns).toUpperCase();
            }
        }
        return aliases;
    }


    /**
     * This function writes the html to create a column in the output.
     *
     * @param col
     * @param indent
     * @param joins
     * @param columns
     * @param alias
     * @returns {string}
     */
    const renderColumn = (col, indent, joins, columns, alias) => {
        let fSpace = indent + space(4);

        let properties = ['fieldId', 'formula', 'id', 'label', 'type'];
        let columnName = alias && alias.toUpperCase() === alias ? alias : getNameForColumn(col, joins, columns);
        col.newAlias = columnName;
        let html = `${indent}columns["${columnName}"] = dataset.createColumn({<br />`;

        properties.forEach((prop)=>{
            if (col[prop]) {
                if (prop === 'formula') {
                    let safeFormula = col[prop].replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    html += `${fSpace}${prop}: "${safeFormula}",<br />`;
                } else {
                    html += `${fSpace}${prop}: "${col[prop]}",<br />`;
                }

            }
        });
        if (alias && alias != "null") {
            html += `${fSpace}alias: "${alias}",<br />`;
        } else {
            html += `${fSpace}alias: "${col.alias}",<br />`;
        }

        if (col.join) {
            html += `${fSpace}join: joins["${findJoinNameForColumn(col, joins)}"]<br />`;
        }
        html += `${indent}});<br />`;
        return html;
    }

    /**
     * This function renders the columns object in a way that allows the columns to
     * be recreated in code.
     *
     * @param columns
     * @param indent
     * @param joins
     * @param ds
     * @returns {string}
     */
    const renderColumns = (columns, indent, joins, ds) => {

        let html = `${indent}const columns = {};<br />`;
        let innerIndent = indent;
        let aliases = getAliasesForColumns(ds.columns, joins);

        for (let colName in columns) {
            let alias = null;
            if (aliases.length) {
                alias = aliases.shift();
            }
            html += renderColumn(columns[colName], innerIndent, joins, columns, alias);
        }
        html += `<br />`;
        return html;
    }

    const renderCondition = (condition, indent) => {
        let html = ``;
        let childIndent = indent + space(4);
        if (condition.children && condition.children.length) { //this is a logical operator level
            html += `${indent}dataset.createCondition({<br />
                    ${childIndent}operator: "${condition.operator}",<br />
                    ${childIndent}children: [<br />`;
            condition.children.forEach((child)=>{
                html += renderCondition(child, childIndent + space(4));
            });
            html = html.replace(/,<br \/>$/, `<br />`);
            html += `${childIndent}]<br />
            ${indent}}),<br />`;

        } else {
            html += `${indent}dataset.createCondition({<br />
                     ${childIndent}column: columns["${condition.column.colName}"],<br />
                     ${childIndent}operator: "${condition.operator}",<br />
                     ${childIndent}values: ${condition.values && condition.values[0] || condition.values[0] === false || condition.values[0] === 0 ? JSON.stringify(condition.values) : "[]"}<br />
                     ${indent}}),<br />`
        }

        return html;
    }

    const renderResultColumns = (ds, columns, joins, indent) => {
        let childIndent = indent + space(4);
        let html = `${indent}\/\/ Columns returned in results <br />
                    ${indent}const resultColumns = [<br />`;
        ds.columns.forEach((col)=>{
            html += `${childIndent}columns["${col.newAlias}"],<br />`;
        });
        html = trimComma(html);
        html += `${indent}];<br /><br />`;
        return html;
    }

    const renderCreateDataset = (ds, indent) => {
        let html = ``;
        const childIndent = `${indent + space(4)}`;
        html += `${indent}const ds = dataset.create({<br />`;
        html += `${childIndent}type: "${ds.type}",<br />`;
        if (ds.condition) {
            html += `${childIndent}condition,<br />`;
        }
        html += `${childIndent}columns: resultColumns,<br />`;
        html += `${childIndent}description: "optional description",<br />`;
        html += `${childIndent}id: "${ds.id}",<br />`;
        html += `${childIndent}name: "${ds.name}"<br />`;
        html += `${indent}});<br />`;
        html += `<br />${indent}return ds;<br />`;

        return html;
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
        return `${space(4)}const getAllMappedResults = (wb) => {<br />
            ${space(8)}const pageData = wb.runPaged({pageSize: 1000});<br />
            ${space(8)}let allResults = [];<br />
            ${space(8)}const allPages = [];<br />
            ${space(8)}pageData.iterator().each((page)=>{<br />
            ${space(12)}    let currentPage = page.value;<br />
            ${space(12)}    allPages.push(currentPage.data);<br />
            ${space(12)}    return true;<br />
            ${space(8)}});<br />
            ${space(8)}allPages.forEach((page) => {<br />
            ${space(12)}    allResults = allResults.concat(page.asMappedResults());<br />
            ${space(8)}});<br />
            ${space(8)}return allResults;<br />
             }<br />`;
    }


    const renderExportDataset = (ds) => {
        const joins = getJoins(ds);
        const columns = getColumns(ds, joins);
        console.log('joins', joins);
        console.log('columns', columns);
        let html = ``;

        html += `${space(4)}const createDataset = () => {<br />`;
        html += renderJoins(ds, joins, space(8));
        html += renderColumns(columns, space(8), joins, ds);
        html += renderResultColumns(ds, columns, joins, space(8));
        html += `${space(8)}const condition = <br />` + renderCondition(ds.condition, space(8));
        html = trimComma(html);
        html += renderCreateDataset(ds, space(8));
        html += `${space(4)}};<br />`;
        html += `\/\/ Function to get all results as mapped results<br />`;
        html += renderGetResultsFunction();
        html += `<br /><br />${space(4)}\/\/ getAllMappedResults(createDataset());<br />`;


        return html;
    }

    const datasetId = getDatasetId(datasetName);
    const ds = dataset.load({id: datasetId});
    const html = renderExportDataset(ds);
    const popup = window.open("", "_blank");
    popup.document.body.innerHTML = html;
    popup.document.title = 'Dataset Code';

});