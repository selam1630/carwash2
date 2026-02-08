import { Injectable } from "@nestjs/common";

@Injectable()
export class SmsService {
    async sendOtp(phone:string,otp:string):Promise<void>{
        // TODO: Integrate real SMS provider

        console.log(`Sending OTP ${otp} to phone ${phone}`);

    }
}