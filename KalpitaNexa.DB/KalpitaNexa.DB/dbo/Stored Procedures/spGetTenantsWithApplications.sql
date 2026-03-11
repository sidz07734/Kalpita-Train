
CREATE PROCEDURE [dbo].[spGetTenantsWithApplications]
/*
	Object Name : dbo.spUpdateTenant
	Object Type : StoredProcedure
	Created Date: 06-10-2025
	Created By  : Archana Gudise
	Purpose     : Updates a tenant's details, synchronizes its applications, and updates features.
*/
(
    @RequestingUserEmail NVARCHAR(300)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IsSuperAdmin BIT;

    -- Step 1: Verify the user is a Super Admin based on their email
    SELECT @IsSuperAdmin = u.IsSuperAdmin
    FROM dbo.Users u
    WHERE u.UserEmail = @RequestingUserEmail AND u.IsActive = 1;

    -- Step 2: If not a Super Admin, return an empty result set
    IF @IsSuperAdmin = 0 OR @IsSuperAdmin IS NULL
    BEGIN
        -- Return nothing to enforce security
        RETURN;
    END

    -- Step 3: Fetch tenants and aggregate their application names
    -- Using a Common Table Expression (CTE) to first aggregate application names per tenant
    ;WITH AppNames AS (
        SELECT
            TenantId,
            STRING_AGG(ApplicationName, ', ') AS ApplicationNames
        FROM [dbo].[Applications]
        WHERE IsActive = 1
        GROUP BY TenantId
    )
    SELECT
        t.TenantId,
        t.TenantName,
        t.IsActive,
        t.CreatedOn,
        t.CreatedBy,
        ISNULL(an.ApplicationNames, 'No [dbo].[Applications] assigned') AS Applications
    FROM dbo.Tenants t
    LEFT JOIN AppNames an ON t.TenantId = an.TenantId
    WHERE t.IsActive = 1
    ORDER BY t.TenantName;

END;