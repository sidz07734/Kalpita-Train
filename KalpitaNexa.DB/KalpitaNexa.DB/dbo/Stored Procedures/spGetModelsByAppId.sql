
CREATE PROCEDURE [dbo].[spGetModelsByAppId]
/*
	Object Name : dbo.spGetModelsByAppId
	Object Type : StoredProcedure
	Created Date: 14-10-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves all active models for a specific application ID to populate a dropdown.
*/
(
    @AppId INT
)
AS
BEGIN
    SET NOCOUNT ON;

    -- Select the Module ID and Name for the given AppId
    -- This joins the application-specific [dbo].[Model] settings with the main [dbo].[Model] table
    -- and filters to ensure only active models are returned.
    SELECT
        m.ModuleID,
        m.ModuleName
    FROM
        [dbo].[ApplicationModels] AS am
    INNER JOIN
        [dbo].[Model] AS m ON am.ModuleID = m.ModuleID
    WHERE
        am.AppId = @AppId
        AND am.IsActive = 1;

END;