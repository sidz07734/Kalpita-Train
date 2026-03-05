
CREATE PROCEDURE [dbo].[spGetLanguagesByAppId]
/*
	Object Name : dbo.spGetLanguagesByAppId
	Object Type : StoredProcedure
	Created Date: 14-10-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves all active languages for a specific application ID to populate a dropdown.
*/
(
    @AppId INT
)
AS
BEGIN
    SET NOCOUNT ON;

    -- Select the Language ID and Name for the given AppId
    -- This joins the application-specific language settings with the main languages table
    -- and filters to ensure only active languages are returned.
    SELECT
        l.LanguageID,
        l.LanguageName
    FROM
        [dbo].[ApplicationLanguages] AS al
    INNER JOIN
        dbo.Languages AS l ON al.LanguageId = l.LanguageID
    WHERE
        al.AppId = @AppId
        AND al.IsActive = 1;

END;