 
CREATE   PROCEDURE [dbo].[spGetTenantFeatures]

/*

    Object Name : dbo.spGetTenantFeatures

    Object Type : StoredProcedure

    Created Date: 19-09-2025

	Modified Date: 

    Created By  : Vyshnavi Atthuluri

    Purpose     : Retrieves all active features for a specific TenantId

                  based on the TenantFeatureMapping table.

*/

(

    @TenantId UNIQUEIDENTIFIER,

    @AppId INT

)

AS

BEGIN

    SET NOCOUNT ON;
 
    SELECT

        f.FeatureId,

        f.FeatureName,

        f.IsActive,

        f.CreatedOn,

        f.CreatedBy,

        f.ModifiedOn,

        f.ModifiedBy

    FROM

        dbo.TenantFeatureMapping AS tfm

    INNER JOIN

        dbo.Features AS f ON tfm.FeatureId = f.FeatureId

    WHERE

        tfm.TenantId = @TenantId

        AND tfm.AppId = @AppId      -- Filter by AppId

        AND tfm.IsActive = 1        -- Mapping is active

        AND f.IsActive = 1          -- Feature is active

    ORDER BY

        f.FeatureName;

END;