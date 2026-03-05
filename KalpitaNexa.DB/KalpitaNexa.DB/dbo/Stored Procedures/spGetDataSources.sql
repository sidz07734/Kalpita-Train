CREATE PROCEDURE dbo.spGetDataSources
/*
    Object Name : dbo.spGetDataSources
    Object Type : StoredProcedure
    Created Date: 23-09-2025
    Created By  : Kalpataru Sahoo
    Purpose     : Retrieves a list of all active data sources from the DataSources table.
*/
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        DataSourceId,
        DataSourceName,
        DataSourceType
    FROM
        dbo.DataSources
    WHERE
        IsActive = 1 -- Only return active data sources for the catalog
    ORDER BY
        DataSourceName;
END