
/*
    Object Name : dbo.spGetUserSettings
    Object Type : StoredProcedure
    Modified Date: 2025-11-12 11:20:35
    Modified By  : Vaishnavi Mohan
    Purpose     : Retrieves the langaugae,application and sourcename for individual users
*/



CREATE PROCEDURE [dbo].[spGetUserSettings]
    @UserID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        u.UserID,
        l.LanguageName,
        a.ApplicationName,
        d.DataSourceName,
        u.IsDarkMode
    FROM 
        dbo.UserSettings u
    LEFT JOIN 
        dbo.Languages l ON u.DefaultLanguageID = l.LanguageID
    LEFT JOIN 
        [dbo].[Applications] a ON u.AppID = a.ClientId -- Joining on ClientId
    LEFT JOIN 
        dbo.DataSources d ON u.DefaultDataSourceID = d.DataSourceId
    WHERE 
        u.UserID = @UserID;
END