



/*
    Object Name : dbo.spGetUserPermissions
    Object Type : StoredProcedure
    Created Date: 2025-11-12 11:20:35
    Created By : Vaishnavi Mohan
    Purpose : Retrieves all application-level permissions and configuration options for a given user.
*/
CREATE PROCEDURE[dbo].[spGetUserPermissions] 
    @UserEmail NVARCHAR(255),
    @AppId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- (Declaration and User lookup section remains the same)
    DECLARE @UserId UNIQUEIDENTIFIER, @RoleId INT, @RoleName NVARCHAR(200), @TenantId UNIQUEIDENTIFIER, @IsSuperAdmin BIT;
    SELECT
        @UserId = u.UserId, @IsSuperAdmin = u.IsSuperAdmin, @TenantId = tu.TenantId,
        @RoleId = tu.RoleId, @RoleName = r.RoleName
    FROM dbo.Users u
    LEFT JOIN dbo.UserRoles tu ON u.UserId = tu.UserId
    LEFT JOIN dbo.Roles r ON tu.RoleId = r.RoleId
    WHERE u.UserEmail = @UserEmail AND u.IsActive = 1;
    IF @UserId IS NULL BEGIN RETURN; END
    -- Result Set 1: [dbo].[Applications] (Logic is unchanged)
    IF @IsSuperAdmin = 1
	BEGIN
    SELECT
        a.AppId,
        a.ApplicationName,
        d.DataSourceId,
        d.DataSourceName,
		ad.IsDefault
    FROM
        [dbo].[Application] AS a
        INNER JOIN [dbo].[ApplicationDataSources] AS ad ON a.AppId = ad.AppId
        INNER JOIN [dbo].[DataSources] AS d ON ad.DataSourceId = d.DataSourceId
    WHERE
        a.IsActive = 1
        AND ad.IsActive = 1
        AND d.IsActive = 1
    ORDER BY
        a.ApplicationName,
        d.DataSourceName;
	END
    ELSE
	BEGIN
    SELECT
        a.AppId,
        a.ApplicationName,
        d.DataSourceId,
        d.DataSourceName,
		ad.IsDefault
    FROM
        [dbo].[TenantApplication] AS ta
        INNER JOIN [dbo].[Application] AS a ON ta.AppId = a.AppId
        INNER JOIN [dbo].[ApplicationDataSources] AS ad ON a.AppId = ad.AppId
        INNER JOIN [dbo].[DataSources] AS d ON ad.DataSourceId = d.DataSourceId
    WHERE
        ta.TenantId = @TenantId
        AND a.IsActive = 1
        AND ad.IsActive = 1
        AND d.IsActive = 1
    ORDER BY
        a.ApplicationName,
        d.DataSourceName;
	END

    -- Result Set 2: [dbo].[Features] (Logic is unchanged)
    IF @IsSuperAdmin = 1
        SELECT FeatureName FROM [dbo].[Features] WHERE IsActive = 1;
    ELSE IF @RoleName = 'Admin'
        SELECT f.FeatureName FROM [dbo].[Features] f JOIN dbo.TenantFeatureMapping tfm ON f.FeatureId = tfm.FeatureId WHERE tfm.TenantId = @TenantId AND tfm.AppId = @AppId AND tfm.IsActive = 1 AND f.IsActive = 1;
    ELSE
        SELECT f.FeatureName FROM [dbo].[Features] f JOIN [dbo].[RoleFeatures] rf ON f.FeatureId = rf.FeatureId WHERE rf.RoleId = @RoleId AND rf.AppId = @AppId AND rf.IsActive = 1 AND f.IsActive = 1
    -- ============================ CORRECTED LOGIC STARTS HERE ============================
    -- Result Set 3: Allowed Languages for the Application
    	SELECT l.LanguageID, l.LanguageName, al.IsDefault
    	FROM dbo.Languages l
    	JOIN [dbo].[ApplicationLanguages] al ON l.LanguageID = al.LanguageId
    	WHERE al.AppId = @AppId AND al.IsActive = 1; -- Removed l.IsActive check
    -- Result Set 4: Allowed Models for the Applicationll
    SELECT m.ModuleID AS ModelID, m.ModuleName AS ModelName, am.IsDefault
    FROM [dbo].[Model] m
    JOIN [dbo].[ApplicationModels] am ON m.ModuleID = am.ModuleID
    WHERE am.AppId = @AppId AND am.IsActive = 1; -- Removed m.IsActive check
    -- Result Set 5: Allowed Data Sources for the Application
    -- NOTE: Proactively removed the ds.IsActive check as well.
    SELECT ds.DataSourceId AS DataSourceID, ds.DataSourceName, ads.IsDefault
    FROM dbo.DataSources ds
    JOIN [dbo].[ApplicationDataSources] ads ON ds.DataSourceId = ads.DataSourceId
    WHERE ads.AppId = @AppId AND ads.IsActive = 1;
    -- Result Set 6: User's Last Saved Preferences
    -- NOTE: Assumes 'DataSourceID' column exists in UserSettings table.
    SELECT AppID,DefaultLanguageID,DefaultDataSourceID,DefaultModelID FROM dbo.UserSettings WHERE UserID = @UserId;
END