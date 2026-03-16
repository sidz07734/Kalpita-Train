
-- It's better to use ALTER if the procedure might already exist,
-- or just ensure it's dropped before CREATE.
CREATE PROCEDURE [dbo].[spGetModels]
/*
	Object Name : dbo.spGetModels
	Object Type : StoredProcedure
	Created Date: 29-09-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves a list of all available models from the [dbo].[Model] table for use in UI elements.
*/
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Select the ID and Name from the [dbo].[Model] table
    SELECT
        ModuleID AS DefaultModelID,       -- Corrected: Use the actual column name 'ModuleID' and alias it
        ModuleName AS ModelName  -- Corrected: Use 'ModuleName' and alias it for consistency
    FROM
        [dbo].[Model]
    -- Order the results alphabetically by name
    ORDER BY
        ModuleName;
END