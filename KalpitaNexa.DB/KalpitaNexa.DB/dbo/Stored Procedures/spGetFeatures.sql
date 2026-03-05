
CREATE PROCEDURE [dbo].[spGetFeatures]
/*
	Object Name : dbo.spGetFeatures
	Object Type : StoredProcedure
	Updated Date: 12-11-2025
	Updated By  : Vaishnavi Mohan
	Purpose     : Retrieve the dbo.Features according to the app and tenant
*/
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        FeatureId,
        FeatureName,
        IsActive,
        CreatedOn,
        CreatedBy,
        ModifiedOn,
        ModifiedBy
    FROM Features
    WHERE IsActive = 1
    ORDER BY FeatureName ASC;
END