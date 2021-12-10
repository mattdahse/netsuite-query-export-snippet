# Query Export Tool #

This repo is for a tool to convert a workbook created in the UI into code, making it
more portable and enabling a developer to rapidly prototype in-script queries,
add dynamic conditions or columns and otherwise kick N/query butt.

### What is this repository for? ###

* Console-based tool to write not-terrible code based on UI workbooks
* Version 1.0

### How do I get set up? ###

* Open your chrome devtools with F12 (windows) or cmd+option+i (mac).
* Find "Sources" at the top - you may need to drag the window wide to see it
* Find the "Snippets" tab under sources
* Click New Snippet
* Paste the contents of queryExport.js file into this viewport.
* Rename the snippet (right-click and rename) to something appropriate like "Query Export"
* Save the snippet with ctrl+s (windows) or cmd+s (mac)

### How do I use it? ###
* Log into NetSuite with a role that has appropriate permissions for the query you wish to export.
* Navigate to Analytics and either select an existing workbook or create one
* The workbook must have a Table view
* The workbook's columns should ideally be given custom labels (this will make for more intuitive code)
* Note that the dataset's column labels do not matter (just the workbook's)
* Open the devtools console.
* Right-click on the snippet name that you created during setup
* click Run
* Your code will be presented in a new tab.
