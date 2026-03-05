


CREATE PROCEDURE [dbo].[spGetApplications]
/*
	Object Name : dbo.spGetApplications
	Object Type : StoredProcedure
	Created Date: 29-09-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves a list of all active applications, typically for populating frontend UI elements like dropdowns.
*/
@tenantid uniqueidentifier
AS
BEGIN
    -- This prevents the count of affected rows from being returned, which can improve performance.
    SET NOCOUNT ON;
    
    -- Select the ID and Name from the [dbo].[Applications] table
    SELECT
        AppId,
        ApplicationName
    FROM
        [dbo].[Application]
    -- Filter to include only [dbo].[Application] that are marked as active
    WHERE
        IsActive = 1
		and TenantId=@tenantid
    -- Order the results alphabetically by name for a user-friendly display
    ORDER BY
        ApplicationName;
END