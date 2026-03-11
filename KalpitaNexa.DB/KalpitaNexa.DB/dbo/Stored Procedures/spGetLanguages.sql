
CREATE PROCEDURE [dbo].[spGetLanguages]
/*
	Object Name : dbo.spGetLanguages
	Object Type : StoredProcedure
	Created Date: 29-09-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves a list of all available languages to be displayed in UI components.
*/
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Select the ID, Name, AND CODE from the Languages table
    SELECT
        LanguageID,
        LanguageName,
        LanguageCode  -- ✅ THIS LINE IS THE FIX
    FROM
        dbo.Languages
    -- Order the results alphabetically by name
    ORDER BY
        LanguageName;
END