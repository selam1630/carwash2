export class AuthResponseDto{
    accessToken:string;
    refreshToken:string;
    user:{
        id:string;
        phone:string;
        role:string;
    
    }
}